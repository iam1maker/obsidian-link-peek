import { Component, type Editor, Notice, Platform, type Plugin } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { MetadataCache } from "../cache";
import { fetchMetadata } from "../metadata/fetch";
import type { MetadataResult } from "../metadata/types";
import { isExcluded, type LinkPeekSettings } from "../settings";
import { asElement, LinkPopover, type PopoverState } from "./popover";
import { urlFromAnchor, urlFromCanvasNode, urlFromEditor } from "./resolve-dom";
import { urlAtOffset } from "./resolve-editor";
import { urlFromTextNode } from "./resolve-text";
import { isModifierKey, modifierHeld, movedBeyond, type Point } from "./trigger";

/** Grace period when leaving the link so the pointer can travel into the card. */
const HIDE_DELAY_MS = 220;

/** A link the pointer is resting on whose card has not opened yet. */
interface PendingHover {
	url: string;
	target: Element;
	/** Latest pointer event over the link; the card is anchored where the pointer finally rests. */
	event: MouseEvent;
}

/** Everything we hold per window: the listeners (a Component, so they unload together) and the card. */
interface WindowBinding {
	component: Component;
	popover: LinkPopover;
}

/**
 * Document-level `mouseover` and `mousemove` listeners drive everything.
 * Delegation means we never have to re-attach handlers when Obsidian re-renders
 * a view, and the same code path serves Reading view, Live Preview and Canvas.
 * `mousemove` matters in the editor, where one `.cm-line` element can hold
 * several links: `mouseover` fires once per element, movement tells us which
 * link the pointer is actually on.
 *
 * Pop-out windows have their own `document`, so listeners and the card are
 * bound per window; hover state (pending link, open card) is shared, since
 * only one card is ever open.
 */
export class HoverController {
	private bindings = new Map<Document, WindowBinding>();
	/** The card currently shown (or about to be), in whichever window. */
	private active: LinkPopover | null = null;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private pending: PendingHover | null = null;
	private currentUrl: string | null = null;
	private currentAnchor: Element | null = null;
	/** Last pointer position we acted on; movement is measured from here. */
	private lastPointer: Point | null = null;
	private inflight = new Map<string, Promise<MetadataResult>>();

	constructor(
		private plugin: Plugin,
		private cache: MetadataCache,
		private settings: () => LinkPeekSettings,
		private onCacheChanged: () => void,
	) {
		const { workspace } = plugin.app;

		this.bindWindow(document);
		// Pop-outs that already exist when the plugin loads (enable at runtime, reload).
		workspace.iterateAllLeaves((leaf) => this.bindWindow(leaf.view.containerEl.ownerDocument));
		plugin.registerEvent(workspace.on("window-open", (_win, win) => this.bindWindow(win.document)));
		plugin.registerEvent(workspace.on("window-close", (_win, win) => this.unbindWindow(win.document)));

		plugin.register(() => this.destroy());
	}

	private bindWindow(doc: Document): void {
		if (this.bindings.has(doc)) return;
		const component = new Component();
		this.plugin.addChild(component);
		component.registerDomEvent(doc, "mouseover", this.onMouseOver);
		component.registerDomEvent(doc, "mousemove", this.onMouseMove, { passive: true });
		component.registerDomEvent(doc, "mouseout", this.onMouseOut);
		component.registerDomEvent(doc, "keydown", this.onKeyDown);
		component.registerDomEvent(doc, "scroll", this.onScroll, { capture: true, passive: true });
		component.registerDomEvent(doc, "mousedown", this.onMouseDown, { capture: true });

		const popover: LinkPopover = new LinkPopover(doc, {
			options: () => {
				const s = this.settings();
				return {
					showImage: (url) => s.showImages && !isExcluded(url, s.noImageDomains),
					descriptionLines: s.descriptionLines,
					compact: s.compactCards,
				};
			},
			onPinChange: (pinned) => popover.setPinned(pinned),
			onClose: () => this.hideNow(true),
			onRetry: (url) => void this.retry(popover, url),
		});
		this.bindings.set(doc, { component, popover });
	}

	private unbindWindow(doc: Document): void {
		const binding = this.bindings.get(doc);
		if (!binding) return;
		if (this.active === binding.popover) this.hideNow(true);
		this.plugin.removeChild(binding.component);
		binding.popover.destroy();
		this.bindings.delete(doc);
	}

	private popoverFor(doc: Document): LinkPopover {
		this.bindWindow(doc);
		return this.bindings.get(doc)!.popover;
	}

	private get pinned(): boolean {
		return this.active?.pinned ?? false;
	}

	private resolveUrl(target: Element, event: MouseEvent): string | null {
		const { app } = this.plugin;
		const settings = this.settings();
		const url =
			urlFromAnchor(target) ??
			urlFromEditor(app, target, event) ??
			(settings.enableCanvas ? urlFromCanvasNode(app, target) : null) ??
			urlFromTextNode(target, event);
		if (!url || isExcluded(url, settings.excludedDomains)) return null;
		return url;
	}

	private onMouseOver = (event: MouseEvent): void => {
		this.onPointer(event, false);
	};

	private onMouseMove = (event: MouseEvent): void => {
		// Nothing armed and nothing open: the common case, keep it free.
		if (!this.pending && !this.currentUrl) return;
		if (!movedBeyond(this.lastPointer, { x: event.clientX, y: event.clientY })) return;
		this.onPointer(event, true);
	};

	/**
	 * Shared pointer logic. `moved` is true when called for real pointer travel
	 * (as opposed to entering a child element), which is what the stillness rule
	 * keys off.
	 */
	private onPointer(event: MouseEvent, moved: boolean): void {
		const settings = this.settings();
		if (!settings.enabled) return;
		const target = asElement(event.target);
		if (!target) return;
		this.lastPointer = { x: event.clientX, y: event.clientY };

		if (this.active?.contains(target)) {
			this.cancelHide();
			return;
		}
		// A pinned card is the user's reading spot; other links do not steal it.
		if (this.pinned) return;

		const url = this.resolveUrl(target, event);
		if (!url) {
			this.cancelShow();
			this.pending = null;
			if (this.currentUrl) this.scheduleHide();
			return;
		}

		this.cancelHide();
		if (url === this.currentUrl) {
			this.cancelShow();
			this.pending = null;
			return;
		}

		if (this.pending?.url === url) {
			this.pending.target = target;
			this.pending.event = event;
			if (moved && settings.requireStillPointer && this.showTimer !== null) this.startShowTimer();
			return;
		}

		this.cancelShow();
		this.pending = { url, target, event };
		if (modifierHeld(event, settings.triggerModifier, Platform.isMacOS)) this.startShowTimer();
	}

	private onMouseOut = (event: MouseEvent): void => {
		if (this.pinned) return;
		const to = event.relatedTarget;
		if (this.active?.contains(to)) return;
		const toEl = asElement(to);
		if (toEl && this.currentAnchor?.contains(toEl)) return;
		this.cancelShow();
		this.pending = null;
		if (this.currentUrl) this.scheduleHide();
	};

	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") {
			this.hideNow(true);
			return;
		}
		if (this.pinned) return;
		const { triggerModifier } = this.settings();
		if (isModifierKey(event.key, triggerModifier, Platform.isMacOS)) {
			// Pressing the trigger key while already resting on a link opens its card.
			if (!event.repeat && this.pending && this.showTimer === null) this.startShowTimer();
			return;
		}
		// Typing dismisses a card and cancels one that was about to open.
		if (!this.active?.isVisible) this.hideNow();
	};

	private onMouseDown = (event: MouseEvent): void => {
		if (this.pinned || this.active?.contains(event.target)) return;
		this.hideNow();
	};

	private onScroll = (): void => {
		if (!this.pinned) this.hideNow();
	};

	/**
	 * `Preview link under cursor` command. Opens the card pinned: without a
	 * pointer resting on the link there is nothing to keep it alive otherwise.
	 * This is also the only entry point on touch devices.
	 */
	previewAtCursor(editor: Editor): void {
		const cursor = editor.getCursor();
		const url = urlAtOffset(editor.getLine(cursor.line), cursor.ch);
		if (!url || isExcluded(url, this.settings().excludedDomains)) {
			new Notice("Link Peek: no external link under the cursor");
			return;
		}
		if (this.currentUrl === url && this.active?.isVisible) {
			this.active.setPinned(true);
			return;
		}
		this.hideNow(true);
		const cm = editorViewOf(editor);
		const popover = this.popoverFor(cm?.dom.ownerDocument ?? activeDocument);
		popover.setPinned(true);
		void this.open(popover, url, null, cursorRect(editor, cm, cursor));
	}

	private startShowTimer(): void {
		this.cancelShow();
		this.showTimer = window.setTimeout(() => {
			this.showTimer = null;
			const pending = this.pending;
			this.pending = null;
			if (!pending) return;
			const popover = this.popoverFor(pending.target.ownerDocument);
			void this.open(popover, pending.url, pending.target, anchorRectFor(pending.target, pending.event));
		}, this.settings().hoverDelayMs);
	}

	private async open(popover: LinkPopover, url: string, anchor: Element | null, anchorRect: DOMRect): Promise<void> {
		if (this.active && this.active !== popover) this.active.hide();
		this.active = popover;
		this.currentUrl = url;
		this.currentAnchor = anchor;

		const cached = this.cache.get(url);
		if (cached) {
			popover.show(anchorRect, toState(url, cached));
			return;
		}

		popover.show(anchorRect, { kind: "loading", url });
		const result = await this.lookup(url);
		// The pointer may have moved on while we were fetching.
		if (this.currentUrl !== url || this.active !== popover) return;
		popover.update(toState(url, result));
	}

	/** Retry button on an error card: drop the cached failure and fetch again in place. */
	private async retry(popover: LinkPopover, url: string): Promise<void> {
		if (this.active !== popover || this.currentUrl !== url) return;
		this.cache.delete(url);
		popover.update({ kind: "loading", url });
		const result = await this.lookup(url);
		if (this.currentUrl !== url || this.active !== popover) return;
		popover.update(toState(url, result));
	}

	private lookup(url: string): Promise<MetadataResult> {
		const existing = this.inflight.get(url);
		if (existing) return existing;
		const promise = fetchMetadata(url)
			.then((result) => {
				this.cache.set(url, result);
				this.onCacheChanged();
				return result;
			})
			.finally(() => this.inflight.delete(url));
		this.inflight.set(url, promise);
		return promise;
	}

	private scheduleHide(): void {
		if (this.hideTimer !== null) return;
		this.hideTimer = window.setTimeout(() => {
			this.hideTimer = null;
			this.hideNow();
		}, HIDE_DELAY_MS);
	}

	private cancelHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private cancelShow(): void {
		if (this.showTimer !== null) {
			window.clearTimeout(this.showTimer);
			this.showTimer = null;
		}
	}

	/** Pinned cards only close on an explicit action (Esc, close button, command). */
	private hideNow = (force = false): void => {
		if (this.pinned && !force) return;
		this.cancelShow();
		this.cancelHide();
		this.pending = null;
		this.currentUrl = null;
		this.currentAnchor = null;
		this.active?.hide();
		this.active = null;
	};

	private destroy(): void {
		this.hideNow(true);
		for (const doc of [...this.bindings.keys()]) this.unbindWindow(doc);
	}
}

function toState(url: string, result: MetadataResult): PopoverState {
	return result.ok ? { kind: "ready", meta: result.meta } : { kind: "error", url, error: result.error, errorKind: result.kind };
}

/** `editor.cm` is the CM6 EditorView; not in the public typings but stable since 1.0. */
function editorViewOf(editor: Editor): EditorView | null {
	return (editor as unknown as { cm?: EditorView }).cm ?? null;
}

/** Where the caret is on screen, so a keyboard-opened card appears next to it. */
function cursorRect(editor: Editor, cm: EditorView | null, cursor: { line: number; ch: number }): DOMRect {
	const coords = cm?.coordsAtPos(editor.posToOffset(cursor));
	if (coords) return new DOMRect(coords.left, coords.top, 1, coords.bottom - coords.top);
	// Not rendered (very long document, folded region): fall back to the viewport centre.
	const win = cm?.dom.win ?? activeWindow;
	return new DOMRect(win.innerWidth / 2, win.innerHeight / 3, 1, 20);
}

/**
 * Anchor the card to the hovered element when it is link-sized; for editor lines
 * (whose element is the whole `.cm-line`) anchor to the pointer instead.
 */
function anchorRectFor(target: Element, event: MouseEvent): DOMRect {
	const anchor = target.closest("a, .canvas-node") ?? target;
	const rect = anchor.getBoundingClientRect();
	if (rect.width > 0 && rect.width < 600 && rect.height < 200) return rect;
	return new DOMRect(event.clientX, event.clientY - 10, 1, 20);
}
