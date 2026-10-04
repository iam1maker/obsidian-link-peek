import { setIcon } from "obsidian";
import { describeError } from "../metadata/errors";
import type { ErrorKind, LinkMetadata } from "../metadata/types";
import { displayUrl, hostnameOf } from "../metadata/parse";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

export type PopoverState =
	| { kind: "loading"; url: string }
	| { kind: "error"; url: string; error: string; errorKind?: ErrorKind }
	| { kind: "ready"; meta: LinkMetadata };

export interface CardOptions {
	/** Whether to show the thumbnail for this URL (global toggle and per-host blocklist). */
	showImage: (url: string) => boolean;
	descriptionLines: number;
	compact: boolean;
}

export interface PopoverCallbacks {
	options: () => CardOptions;
	/** The user toggled the pin button. */
	onPinChange: (pinned: boolean) => void;
	/** The user pressed the close button. */
	onClose: () => void;
	/** The user asked to retry a failed lookup. */
	onRetry: (url: string) => void;
}

/** Cross-window safe element check: `instanceof Element` fails for nodes from a pop-out window. */
export function asElement(target: EventTarget | null | undefined): Element | null {
	return target && (target as Node).nodeType === 1 ? (target as Element) : null;
}

/**
 * One floating card per window, reused for every hover in it. Attached to that
 * window's `body` so it escapes editor overflow clipping; positioned below the
 * anchor when there is room, otherwise above, and clamped to the viewport.
 */
export class LinkPopover {
	readonly el: HTMLElement;
	private anchorRect: DOMRect | null = null;
	private state: PopoverState | null = null;
	private _pinned = false;

	constructor(
		readonly doc: Document,
		private callbacks: PopoverCallbacks,
	) {
		this.el = doc.body.createDiv({ cls: "lpk-popover", attr: { role: "tooltip" } });
		this.el.hide();
	}

	get isVisible(): boolean {
		return this.el.isShown();
	}

	get pinned(): boolean {
		return this._pinned;
	}

	/** Pinned cards stay open until closed explicitly; the header reflects the state. */
	setPinned(pinned: boolean): void {
		if (this._pinned === pinned) return;
		this._pinned = pinned;
		this.el.toggleClass("is-pinned", pinned);
		if (this.state) this.render(this.state);
	}

	contains(target: EventTarget | null): boolean {
		const node = target as Node | null;
		return !!node && typeof node.nodeType === "number" && this.el.contains(node);
	}

	show(anchorRect: DOMRect, state: PopoverState): void {
		this.anchorRect = anchorRect;
		// Obsidian's own popovers (Page preview, footnotes) share our z-index layer and are
		// appended when they open; moving to the end of <body> keeps the card above them.
		this.doc.body.appendChild(this.el);
		this.render(state);
		this.el.show();
		this.position();
	}

	update(state: PopoverState): void {
		if (!this.isVisible) return;
		this.render(state);
		this.position();
	}

	hide(): void {
		this.el.hide();
		this.el.empty();
		this.anchorRect = null;
		this.state = null;
		this.setPinned(false);
	}

	destroy(): void {
		this.el.remove();
	}

	private render(state: PopoverState): void {
		this.state = state;
		const options = this.callbacks.options();
		this.el.empty();
		this.el.toggleClass("is-loading", state.kind === "loading");
		this.el.toggleClass("is-error", state.kind === "error");
		this.el.toggleClass("is-compact", options.compact);
		this.el.style.setProperty("--lpk-desc-lines", String(options.descriptionLines));

		if (state.kind === "loading") {
			this.renderHeader(hostnameOf(state.url), null, state.url);
			this.el.createDiv({ cls: "lpk-title lpk-skeleton" });
			if (!options.compact) this.el.createDiv({ cls: "lpk-desc lpk-skeleton" });
			return;
		}

		if (state.kind === "error") {
			this.renderError(state);
			return;
		}

		const { meta } = state;
		if (!options.compact && meta.image && options.showImage(meta.url)) {
			const figure = this.el.createDiv({ cls: "lpk-image" });
			const img = figure.createEl("img", { attr: { src: meta.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
			img.addEventListener("error", () => figure.remove(), { once: true });
			img.addEventListener("load", () => this.position(), { once: true });
		}
		this.renderHeader(meta.siteName ?? hostnameOf(meta.url), meta.favicon, meta.url);
		this.el.createDiv({ cls: "lpk-title", text: meta.title ?? meta.url });
		if (options.compact) return;
		if (meta.description) {
			this.el.createDiv({ cls: "lpk-desc", text: meta.description });
		} else if (meta.title) {
			// No description (Hacker News, many blogs): show the readable URL so the card is never a lone title.
			this.el.createDiv({ cls: "lpk-desc lpk-desc-url", text: displayUrl(meta.url) });
		}
	}

	private renderError(state: Extract<PopoverState, { kind: "error" }>): void {
		this.renderHeader(hostnameOf(state.url), null, state.url);
		this.el.createDiv({ cls: "lpk-title", text: displayUrl(state.url) });
		this.el.createDiv({ cls: "lpk-error-text", text: describeError(state.errorKind, state.error), attr: { title: state.error } });

		const buttons = this.el.createDiv({ cls: "lpk-buttons" });
		buttons.createEl("a", { cls: "lpk-open-btn", href: state.url, text: "Open in browser" });
		// Blocked sites will block the retry too; only offer it where it can help.
		if (state.errorKind !== "blocked" && state.errorKind !== "notfound" && state.errorKind !== "empty") {
			const retry = buttons.createEl("button", { cls: "lpk-retry", text: "Retry" });
			retry.addEventListener("click", (event) => {
				event.preventDefault();
				this.callbacks.onRetry(state.url);
			});
		}
	}

	private renderHeader(siteName: string | null, favicon: string | null, url: string): void {
		const header = this.el.createDiv({ cls: "lpk-header" });
		if (favicon) {
			const icon = header.createEl("img", { cls: "lpk-favicon", attr: { src: favicon, alt: "", referrerpolicy: "no-referrer" } });
			icon.addEventListener("error", () => icon.remove(), { once: true });
		} else {
			setIcon(header.createSpan({ cls: "lpk-favicon lpk-favicon-fallback" }), "globe");
		}
		header.createSpan({ cls: "lpk-site", text: siteName ?? url });

		const pin = header.createEl("button", {
			cls: "lpk-action lpk-pin clickable-icon",
			attr: { "aria-label": this._pinned ? "Unpin" : "Pin (keep open)", "aria-pressed": String(this._pinned) },
		});
		setIcon(pin, this._pinned ? "pin-off" : "pin");
		pin.addEventListener("click", (event) => {
			event.preventDefault();
			this.callbacks.onPinChange(!this._pinned);
		});

		const open = header.createEl("a", { cls: "lpk-action lpk-open", href: url, attr: { "aria-label": "Open link" } });
		setIcon(open, "external-link");

		if (this._pinned) {
			const close = header.createEl("button", { cls: "lpk-action lpk-close clickable-icon", attr: { "aria-label": "Close" } });
			setIcon(close, "x");
			close.addEventListener("click", (event) => {
				event.preventDefault();
				this.callbacks.onClose();
			});
		}
	}

	private position(): void {
		const anchor = this.anchorRect;
		if (!anchor) return;
		const { innerWidth, innerHeight } = this.el.win;
		const rect = this.el.getBoundingClientRect();

		let left = anchor.left;
		if (left + rect.width > innerWidth - VIEWPORT_MARGIN) left = innerWidth - VIEWPORT_MARGIN - rect.width;
		left = Math.max(VIEWPORT_MARGIN, left);

		const below = anchor.bottom + ANCHOR_GAP;
		const fitsBelow = below + rect.height <= innerHeight - VIEWPORT_MARGIN;
		const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - rect.height);

		this.el.style.left = `${Math.round(left)}px`;
		this.el.style.top = `${Math.round(top)}px`;
		this.el.toggleClass("is-above", !fitsBelow);
	}
}
