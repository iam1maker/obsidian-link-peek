import { syntaxTree } from "@codemirror/language";
import { Prec, type Range, StateEffect, type EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import { isCarded } from "../cards/live-preview";
import { isExcluded } from "../settings";
import { appendIcon, fillChip, openUrl, showLinkMenu, spanFor } from "./chip";
import { classifyNode, isHttpUrl, markdownLinkStart, touches, type UrlNodeKind } from "./classify";
import type { InlineContext } from "./context";
import { chipLabel, type ChipLabel } from "./label";

/** Asks every editor to rebuild after a cache, settings or frontmatter change. */
const refreshEffect = StateEffect.define<null>();

function placeCaret(view: EditorView, el: HTMLElement): void {
	const pos = view.posAtDOM(el);
	view.dispatch({ selection: { anchor: pos } });
	view.focus();
}

/** A bare URL shown as favicon + title. The source text is untouched; the caret brings it back. */
class ChipWidget extends WidgetType {
	constructor(
		readonly url: string,
		readonly label: ChipLabel,
		private ctx: InlineContext,
	) {
		super();
	}

	eq(other: ChipWidget): boolean {
		return other.url === this.url && other.label.title === this.label.title && other.label.favicon === this.label.favicon;
	}

	toDOM(view: EditorView): HTMLElement {
		const el = spanFor(view.dom, "lpk-chip");
		el.dataset.href = this.url;
		fillChip(el, this.label);
		// Same click model as Obsidian's own links: click opens, Alt/Option-click edits.
		el.addEventListener("mousedown", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (event.altKey) placeCaret(view, el);
		});
		el.addEventListener("click", (event) => {
			if (event.button !== 0 || event.altKey) return;
			event.preventDefault();
			openUrl(this.url);
		});
		el.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			showLinkMenu(event, this.url, { edit: () => placeCaret(view, el), peek: () => this.ctx.peek(this.url, el) });
		});
		return el;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

/** A favicon in front of `[text](url)`; the author's text stays as written. */
class FaviconWidget extends WidgetType {
	constructor(
		readonly url: string,
		readonly src: string,
	) {
		super();
	}

	eq(other: FaviconWidget): boolean {
		return other.url === this.url && other.src === this.src;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrap = spanFor(view.dom, "lpk-link-icon-wrap");
		appendIcon(wrap, this.src, "lpk-link-icon");
		wrap.addEventListener("click", (event) => {
			event.preventDefault();
			openUrl(this.url);
		});
		return wrap;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

interface UrlNode {
	kind: UrlNodeKind;
	from: number;
	to: number;
}

function isLivePreview(state: EditorState): boolean {
	return state.field(editorLivePreviewField, false) ?? false;
}

/**
 * Walk Obsidian's syntax tree over the visible ranges and collect URL tokens.
 * Adjacent nodes of the same kind are merged, in case the parser splits a URL.
 */
function urlNodes(view: EditorView): UrlNode[] {
	const tree = syntaxTree(view.state);
	const nodes: UrlNode[] = [];
	const seen = new Set<number>();
	for (const { from, to } of view.visibleRanges) {
		tree.iterate({
			from,
			to,
			enter: (node) => {
				const kind = classifyNode(node.name);
				if (!kind) return;
				const last = nodes[nodes.length - 1];
				if (last && last.kind === kind && last.to === node.from) {
					last.to = node.to;
					return;
				}
				if (seen.has(node.from)) return;
				seen.add(node.from);
				nodes.push({ kind, from: node.from, to: node.to });
			},
		});
	}
	return nodes;
}

class InlineLinksView {
	chips: DecorationSet = Decoration.none;
	icons: DecorationSet = Decoration.none;
	private timer: number | null = null;
	private destroyed = false;
	private unsubscribe: () => void;

	constructor(
		private view: EditorView,
		private ctx: InlineContext,
	) {
		this.build();
		this.unsubscribe = ctx.onRefresh(() => this.scheduleRefresh());
	}

	update(update: ViewUpdate): void {
		this.view = update.view;
		if (update.view.composing) {
			// Never rebuild under an IME composition: replacing text next to it is what
			// makes CJK input drop or insert characters. Keep positions in step instead.
			this.chips = this.chips.map(update.changes);
			this.icons = this.icons.map(update.changes);
			return;
		}
		const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)));
		const modeChanged = isLivePreview(update.startState) !== isLivePreview(update.state);
		if (update.docChanged || update.viewportChanged || update.selectionSet || modeChanged || refreshed) this.build();
	}

	destroy(): void {
		this.destroyed = true;
		this.unsubscribe();
		if (this.timer !== null) this.view.dom.win.clearTimeout(this.timer);
	}

	/**
	 * Metadata arrives from promises, often several at once. Coalesce into one
	 * refresh on the next tick: dispatching straight from a promise callback can
	 * land in the middle of a CodeMirror update and throw.
	 */
	private scheduleRefresh(): void {
		if (this.timer !== null || this.destroyed) return;
		this.timer = this.view.dom.win.setTimeout(() => {
			this.timer = null;
			if (this.destroyed || this.view.composing) return;
			this.view.dispatch({ effects: refreshEffect.of(null) });
		}, 0);
	}

	private optedOut(): boolean {
		const file = this.view.state.field(editorInfoField, false)?.file;
		return this.ctx.optedOut(file?.path ?? null);
	}

	private build(): void {
		const settings = this.ctx.settings();
		const wantChips = settings.inlineTitles !== "off";
		const wantIcons = settings.inlineFavicons;
		this.chips = Decoration.none;
		this.icons = Decoration.none;
		if (!isLivePreview(this.view.state) || (!wantChips && !wantIcons) || this.optedOut()) return;

		const { doc, selection } = this.view.state;
		const { service } = this.ctx;
		const fetching = settings.inlineTitles === "fetch";
		const chips: Range<Decoration>[] = [];
		const icons: Range<Decoration>[] = [];
		const toFetch: string[] = [];

		for (const node of urlNodes(this.view)) {
			const url = doc.sliceString(node.from, node.to).trim();
			if (!isHttpUrl(url) || isExcluded(url, settings.excludedDomains)) continue;
			if (isCarded(this.view.state, node.from)) continue;

			if (node.kind === "target") {
				if (!wantIcons) continue;
				const line = doc.lineAt(node.from);
				const link = markdownLinkStart(line.text, node.from - line.from);
				if (!link || link.isImage) continue;
				const favicon = service.peek(url)?.favicon;
				if (favicon) {
					icons.push(Decoration.widget({ widget: new FaviconWidget(url, favicon), side: -1 }).range(line.from + link.start));
				} else if (fetching && !service.get(url)) {
					toFetch.push(url);
				}
				continue;
			}

			if (!wantChips) continue;
			// Autolinks reveal when the caret is on their angle brackets too.
			const pad = node.kind === "autolink" ? 1 : 0;
			if (selection.ranges.some((r) => touches(r.from, r.to, node.from - pad, node.to + pad))) continue;
			const label = chipLabel(service.peek(url), settings.inlineMaxTitle);
			if (label) {
				chips.push(Decoration.replace({ widget: new ChipWidget(url, label, this.ctx) }).range(node.from, node.to));
			} else if (fetching && !service.get(url)) {
				toFetch.push(url);
			}
		}

		this.chips = Decoration.set(chips, true);
		this.icons = Decoration.set(icons, true);
		if (toFetch.length > 0) this.ctx.prefetch.enqueue(toFetch);
	}
}

/**
 * Chips use default precedence: Obsidian does not decorate bare URLs itself.
 * Favicons on `[text](url)` sit at the lowest precedence so they never fight
 * Obsidian's own replace decorations that hide the link markup.
 */
export function inlineEditorExtension(ctx: InlineContext) {
	const plugin = ViewPlugin.define((view) => new InlineLinksView(view, ctx));
	return [
		plugin,
		EditorView.decorations.of((view) => view.plugin(plugin)?.chips ?? Decoration.none),
		Prec.lowest(EditorView.decorations.of((view) => view.plugin(plugin)?.icons ?? Decoration.none)),
	];
}
