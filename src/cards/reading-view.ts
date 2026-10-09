import { MarkdownRenderChild, type Plugin } from "obsidian";
import { divFor, openUrl, showLinkMenu } from "../inline/chip";
import { isBareAnchor } from "../inline/classify";
import type { InlineContext } from "../inline/context";
import type { LinkMetadata } from "../metadata/types";
import { isExcluded } from "../settings";
import { cardKey, renderCard, renderSkeleton } from "./render";

/** Rendered paragraphs that never become cards, matching the Live Preview rules. */
const SKIP_CONTAINERS = "li, blockquote, td, th, .callout";

/**
 * One paragraph holding nothing but a bare URL. The paragraph stays in the DOM,
 * hidden, so Obsidian's own handling of it is untouched and switching cards
 * off just shows it again.
 */
class CardReadingChild extends MarkdownRenderChild {
	private card: HTMLDivElement | null = null;
	private shown = "";

	constructor(
		private paragraph: HTMLElement,
		private url: string,
		private sourcePath: string,
		private ctx: InlineContext,
	) {
		super(paragraph);
	}

	onload(): void {
		this.register(this.ctx.onRefresh(() => this.apply()));
		this.apply();
	}

	onunload(): void {
		this.restore();
	}

	private apply(): void {
		const settings = this.ctx.settings();
		const wanted =
			settings.blockCards !== "off" && !this.ctx.optedOut(this.sourcePath) && !isExcluded(this.url, settings.excludedDomains);
		const result = wanted ? this.ctx.service.get(this.url) : null;
		let meta: LinkMetadata | null;
		if (result?.ok) meta = result.meta;
		else if (wanted && !result && settings.blockCards === "fetch") meta = null;
		else {
			this.restore();
			return;
		}
		if (!meta) this.ctx.prefetch.enqueue([this.url]);

		const look = { compact: settings.compactCards, showImage: settings.showImages && !isExcluded(this.url, settings.noImageDomains) };
		const key = cardKey(meta, look);
		if (key === this.shown) return;
		this.shown = key;
		if (!this.card) {
			this.card = divFor(this.paragraph, "lpk-card");
			this.card.addEventListener("click", (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				openUrl(this.url);
			});
			this.card.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				showLinkMenu(event, this.url, {});
			});
			this.paragraph.after(this.card);
			this.paragraph.addClass("lpk-card-source");
		}
		if (meta) renderCard(this.card, meta, look);
		else renderSkeleton(this.card, look);
	}

	private restore(): void {
		this.card?.remove();
		this.card = null;
		this.shown = "";
		this.paragraph.removeClass("lpk-card-source");
	}
}

/** The URL when `p` is exactly one bare external link and nothing else. */
function standaloneAnchorUrl(p: HTMLElement): string | null {
	if (p.closest(SKIP_CONTAINERS)) return null;
	const anchors = p.querySelectorAll<HTMLAnchorElement>("a.external-link");
	if (anchors.length !== 1) return null;
	const a = anchors[0];
	const url = a.getAttribute("href") ?? "";
	const text = a.textContent ?? "";
	if (!isBareAnchor(text, url) || (p.textContent ?? "").trim() !== text.trim()) return null;
	return url;
}

/**
 * Registered before the inline titles so it sees each paragraph while its
 * link text is still the raw URL.
 */
export function registerReadingCards(plugin: Plugin, ctx: InlineContext): void {
	plugin.registerMarkdownPostProcessor((el, mdCtx) => {
		const paragraphs = el.matches("p") ? [el] : Array.from(el.querySelectorAll<HTMLElement>(":scope > p"));
		for (const p of paragraphs) {
			const url = standaloneAnchorUrl(p);
			if (url) mdCtx.addChild(new CardReadingChild(p, url, mdCtx.sourcePath, ctx));
		}
	});
}
