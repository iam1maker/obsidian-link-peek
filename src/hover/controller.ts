import type { Plugin } from "obsidian";
import type { MetadataCache } from "../cache";
import { fetchMetadata } from "../metadata/fetch";
import type { MetadataResult } from "../metadata/types";
import { isExcluded, type LinkPeekSettings } from "../settings";
import { LinkPopover, type PopoverState } from "./popover";
import { urlFromAnchor, urlFromCanvasNode, urlFromEditor } from "./resolve-dom";

/** Grace period when leaving the link so the pointer can travel into the card. */
const HIDE_DELAY_MS = 220;

/**
 * One document-level `mouseover` listener drives everything. Delegation means
 * we never have to re-attach handlers when Obsidian re-renders a view, and the
 * same code path serves Reading view, Live Preview and Canvas.
 */
export class HoverController {
	private popover: LinkPopover;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private currentUrl: string | null = null;
	private currentAnchor: Element | null = null;
	private inflight = new Map<string, Promise<MetadataResult>>();

	constructor(
		private plugin: Plugin,
		private cache: MetadataCache,
		private settings: () => LinkPeekSettings,
		private onCacheChanged: () => void,
	) {
		this.popover = new LinkPopover(() => this.settings().showImages);

		plugin.registerDomEvent(document, "mouseover", this.onMouseOver);
		plugin.registerDomEvent(document, "mouseout", this.onMouseOut);
		plugin.registerDomEvent(document, "keydown", this.onKeyDown);
		plugin.registerDomEvent(document, "scroll", this.hideNow, { capture: true, passive: true });
		plugin.registerDomEvent(document, "mousedown", this.onMouseDown, { capture: true });

		plugin.register(() => this.destroy());
	}

	private resolveUrl(target: Element, event: MouseEvent): string | null {
		const { app } = this.plugin;
		const settings = this.settings();
		const url =
			urlFromAnchor(target) ??
			urlFromEditor(app, target, event) ??
			(settings.enableCanvas ? urlFromCanvasNode(app, target) : null);
		if (!url || isExcluded(url, settings.excludedDomains)) return null;
		return url;
	}

	private onMouseOver = (event: MouseEvent): void => {
		if (!this.settings().enabled) return;
		const target = event.target;
		if (!(target instanceof Element)) return;

		if (this.popover.contains(target)) {
			this.cancelHide();
			return;
		}

		const url = this.resolveUrl(target, event);
		if (!url) {
			if (this.currentUrl) this.scheduleHide();
			return;
		}

		this.cancelHide();
		if (url === this.currentUrl) return;

		this.cancelShow();
		const anchorRect = anchorRectFor(target, event);
		this.showTimer = window.setTimeout(() => {
			this.showTimer = null;
			void this.open(url, target, anchorRect);
		}, this.settings().hoverDelayMs);
	};

	private onMouseOut = (event: MouseEvent): void => {
		const to = event.relatedTarget;
		if (this.popover.contains(to)) return;
		if (to instanceof Element && this.currentAnchor?.contains(to)) return;
		this.cancelShow();
		if (this.currentUrl) this.scheduleHide();
	};

	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape" || !this.popover.isVisible) this.hideNow();
	};

	private onMouseDown = (event: MouseEvent): void => {
		if (!this.popover.contains(event.target)) this.hideNow();
	};

	private async open(url: string, anchor: Element, anchorRect: DOMRect): Promise<void> {
		this.currentUrl = url;
		this.currentAnchor = anchor;

		const cached = this.cache.get(url);
		if (cached) {
			this.popover.show(anchorRect, toState(url, cached));
			return;
		}

		this.popover.show(anchorRect, { kind: "loading", url });
		const result = await this.lookup(url);
		// The pointer may have moved on while we were fetching.
		if (this.currentUrl !== url) return;
		this.popover.update(toState(url, result));
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

	private hideNow = (): void => {
		this.cancelShow();
		this.cancelHide();
		this.currentUrl = null;
		this.currentAnchor = null;
		this.popover.hide();
	};

	private destroy(): void {
		this.hideNow();
		this.popover.destroy();
	}
}

function toState(url: string, result: MetadataResult): PopoverState {
	return result.ok ? { kind: "ready", meta: result.meta } : { kind: "error", url, error: result.error };
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
