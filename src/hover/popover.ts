import { setIcon } from "obsidian";
import type { LinkMetadata } from "../metadata/types";
import { displayUrl, hostnameOf } from "../metadata/parse";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

export type PopoverState =
	| { kind: "loading"; url: string }
	| { kind: "error"; url: string; error: string }
	| { kind: "ready"; meta: LinkMetadata };

/**
 * A single floating card reused for every hover. Attached to `document.body`
 * so it escapes editor overflow clipping; positioned below the anchor when
 * there is room, otherwise above, and clamped to the viewport horizontally.
 */
export class LinkPopover {
	readonly el: HTMLElement;
	private anchorRect: DOMRect | null = null;

	constructor(private showImages: () => boolean) {
		this.el = document.body.createDiv({ cls: "lpk-popover", attr: { role: "tooltip" } });
		this.el.hide();
	}

	get isVisible(): boolean {
		return this.el.isShown();
	}

	contains(target: EventTarget | null): boolean {
		return target instanceof Node && this.el.contains(target);
	}

	show(anchorRect: DOMRect, state: PopoverState): void {
		this.anchorRect = anchorRect;
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
	}

	destroy(): void {
		this.el.remove();
	}

	private render(state: PopoverState): void {
		this.el.empty();
		this.el.toggleClass("is-loading", state.kind === "loading");
		this.el.toggleClass("is-error", state.kind === "error");

		if (state.kind === "loading") {
			this.renderHeader(hostnameOf(state.url), null, state.url);
			this.el.createDiv({ cls: "lpk-title lpk-skeleton" });
			this.el.createDiv({ cls: "lpk-desc lpk-skeleton" });
			return;
		}

		if (state.kind === "error") {
			this.renderHeader(hostnameOf(state.url), null, state.url);
			this.el.createDiv({ cls: "lpk-title", text: state.url });
			this.el.createDiv({ cls: "lpk-desc", text: `Preview unavailable · ${state.error}` });
			return;
		}

		const { meta } = state;
		if (this.showImages() && meta.image) {
			const figure = this.el.createDiv({ cls: "lpk-image" });
			const img = figure.createEl("img", { attr: { src: meta.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } });
			img.addEventListener("error", () => figure.remove(), { once: true });
			img.addEventListener("load", () => this.position(), { once: true });
		}
		this.renderHeader(meta.siteName ?? hostnameOf(meta.url), meta.favicon, meta.url);
		this.el.createDiv({ cls: "lpk-title", text: meta.title ?? meta.url });
		if (meta.description) {
			this.el.createDiv({ cls: "lpk-desc", text: meta.description });
		} else if (meta.title) {
			// No description (Hacker News, many blogs): show the readable URL so the card is never a lone title.
			this.el.createDiv({ cls: "lpk-desc lpk-desc-url", text: displayUrl(meta.url) });
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
		const open = header.createEl("a", { cls: "lpk-open", href: url, attr: { "aria-label": "Open link" } });
		setIcon(open, "external-link");
	}

	private position(): void {
		const anchor = this.anchorRect;
		if (!anchor) return;
		const { innerWidth, innerHeight } = window;
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
