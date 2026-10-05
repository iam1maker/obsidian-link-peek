import { MarkdownRenderChild, type Plugin } from "obsidian";
import { isExcluded } from "../settings";
import { appendIcon, fillChip } from "./chip";
import { isBareAnchor, isHttpUrl } from "./classify";
import type { InlineContext } from "./context";
import { chipLabel } from "./label";

interface DecoratedAnchor {
	a: HTMLAnchorElement;
	url: string;
	/** Autolinked bare URL (text === href) versus a `[text](url)` link. */
	bare: boolean;
	original: string;
	/** What is currently rendered, so a refresh that changes nothing touches no DOM. */
	shown: string;
}

/**
 * Keeps the anchors of one rendered section in step with the cache and the
 * settings. The `<a>` itself is never replaced, so Obsidian's click handling,
 * context menu and the hover card keep working unchanged.
 */
class InlineReadingChild extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private items: DecoratedAnchor[],
		private sourcePath: string,
		private ctx: InlineContext,
	) {
		super(containerEl);
	}

	onload(): void {
		this.register(this.ctx.onRefresh(() => this.apply()));
		this.apply();
	}

	onunload(): void {
		for (const item of this.items) this.restore(item);
	}

	private apply(): void {
		const settings = this.ctx.settings();
		const off = this.ctx.optedOut(this.sourcePath);
		const fetching = settings.inlineTitles === "fetch";
		const { service } = this.ctx;
		const toFetch: string[] = [];

		for (const item of this.items) {
			const excluded = isExcluded(item.url, settings.excludedDomains);
			const meta = service.peek(item.url);
			const wanted = !off && !excluded && (item.bare ? settings.inlineTitles !== "off" : settings.inlineFavicons);
			if (wanted && !meta && fetching && !service.get(item.url)) toFetch.push(item.url);

			if (item.bare) {
				const label = wanted ? chipLabel(meta, settings.inlineMaxTitle) : null;
				const key = label ? `${label.title}|${label.favicon ?? ""}` : "";
				if (key === item.shown) continue;
				if (label) {
					fillChip(item.a, label);
					item.a.addClass("lpk-chip-anchor");
				} else {
					this.restore(item);
				}
				item.shown = key;
				continue;
			}

			const favicon = wanted ? (meta?.favicon ?? null) : null;
			const key = favicon ?? "";
			if (key === item.shown) continue;
			item.a.querySelector(":scope > .lpk-link-icon")?.remove();
			if (favicon) appendIcon(item.a, favicon, "lpk-link-icon", true);
			item.shown = key;
		}

		if (toFetch.length > 0) this.ctx.prefetch.enqueue(toFetch);
	}

	private restore(item: DecoratedAnchor): void {
		if (!item.shown) return;
		if (item.bare) {
			item.a.setText(item.original);
			item.a.removeClass("lpk-chip-anchor");
		} else {
			item.a.querySelector(":scope > .lpk-link-icon")?.remove();
		}
		item.shown = "";
	}
}

export function registerReadingView(plugin: Plugin, ctx: InlineContext): void {
	plugin.registerMarkdownPostProcessor((el, mdCtx) => {
		const items: DecoratedAnchor[] = [];
		for (const a of Array.from(el.querySelectorAll<HTMLAnchorElement>("a.external-link:not([data-lpk])"))) {
			const url = a.getAttribute("href") ?? "";
			if (!isHttpUrl(url) || a.querySelector("img:not(.lpk-link-icon)")) continue;
			a.dataset.lpk = "1";
			const text = a.textContent ?? "";
			items.push({ a, url, bare: isBareAnchor(text, url), original: text, shown: "" });
		}
		if (items.length > 0) mdCtx.addChild(new InlineReadingChild(el, items, mdCtx.sourcePath, ctx));
	});
}
