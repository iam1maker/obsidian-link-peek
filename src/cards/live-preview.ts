import { syntaxTree } from "@codemirror/language";
import { type EditorState, Facet, type Range, StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { editorInfoField, editorLivePreviewField } from "obsidian";
import { divFor, openUrl, showLinkMenu } from "../inline/chip";
import { classifyNode, touches } from "../inline/classify";
import type { InlineContext } from "../inline/context";
import type { LinkMetadata } from "../metadata/types";
import { isExcluded, type LinkPeekSettings } from "../settings";
import { type CardLook, cardKey, renderCard, renderSkeleton } from "./render";
import { isOwnParagraph, standaloneUrl } from "./standalone";

/** Asks every editor to redraw its cards after a cache, settings or frontmatter change. */
export const cardRefreshEffect = StateEffect.define<null>();

/** The plugin context, provided once per editor so the state field can reach it. */
const cardContext = Facet.define<InlineContext, InlineContext | null>({ combine: (values) => values[0] ?? null });

/** Card heights from styles.css, so CodeMirror can lay out before the widgets are drawn. */
const CARD_HEIGHT = 112;
const COMPACT_HEIGHT = 46;

interface Candidate {
	url: string;
	lineFrom: number;
	lineTo: number;
}

interface CardsState {
	/** Standalone URL lines, recomputed only when the document or its parse changes. */
	candidates: Candidate[];
	decorations: DecorationSet;
}

function isLivePreview(state: EditorState): boolean {
	return state.field(editorLivePreviewField, false) ?? false;
}

/** Whether Obsidian's parser saw a bare URL or an autolink exactly there (not code, a comment, math...). */
function parsedAsLink(state: EditorState, from: number, to: number): boolean {
	let start = -1;
	let end = -1;
	syntaxTree(state).iterate({
		from,
		to,
		enter: (node) => {
			const kind = classifyNode(node.name);
			if (kind !== "bare" && kind !== "autolink") return;
			if (start < 0 || node.from > end) start = node.from;
			end = node.to;
		},
	});
	return start >= 0 && start <= from && end >= to;
}

function findCandidates(state: EditorState): Candidate[] {
	const doc: Text = state.doc;
	const found: Candidate[] = [];
	let previous: string | undefined;
	let pending: (Candidate & { before: string | undefined }) | null = null;
	let pos = 0;
	for (const text of doc.iterLines()) {
		if (pending) {
			if (isOwnParagraph(pending.before, text)) found.push(pending);
			pending = null;
		}
		const link = standaloneUrl(text);
		if (link && parsedAsLink(state, pos + link.start, pos + link.end)) {
			pending = { url: link.url, lineFrom: pos, lineTo: pos + text.length, before: previous };
		}
		previous = text;
		pos += text.length + 1;
	}
	if (pending && isOwnParagraph(pending.before, undefined)) found.push(pending);
	return found.map(({ url, lineFrom, lineTo }) => ({ url, lineFrom, lineTo }));
}

function lookFor(url: string, settings: LinkPeekSettings): CardLook {
	return { compact: settings.compactCards, showImage: settings.showImages && !isExcluded(url, settings.noImageDomains) };
}

function placeCaret(view: EditorView, el: HTMLElement): void {
	view.dispatch({ selection: { anchor: view.posAtDOM(el) } });
	view.focus();
}

/** A standalone URL line drawn as a card. The line itself is untouched; the caret brings it back. */
class CardWidget extends WidgetType {
	private readonly key: string;

	constructor(
		readonly url: string,
		private meta: LinkMetadata | null,
		private look: CardLook,
	) {
		super();
		this.key = cardKey(meta, look);
	}

	eq(other: CardWidget): boolean {
		return other.url === this.url && other.key === this.key;
	}

	get estimatedHeight(): number {
		return this.look.compact ? COMPACT_HEIGHT : CARD_HEIGHT;
	}

	toDOM(view: EditorView): HTMLElement {
		// Obsidian forces `display: block` on every direct child of the editor content,
		// so the flex card sits inside a plain wrapper.
		const wrapper = divFor(view.dom, "lpk-card-widget");
		const el = wrapper.createDiv({ cls: "lpk-card" });
		if (this.meta) renderCard(el, this.meta, this.look);
		else renderSkeleton(el, this.look);
		// Same click model as the inline titles: click opens, Alt/Option-click edits.
		el.addEventListener("mousedown", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (event.altKey) placeCaret(view, wrapper);
		});
		el.addEventListener("click", (event) => {
			if (event.button !== 0 || event.altKey) return;
			event.preventDefault();
			openUrl(this.url);
		});
		el.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			showLinkMenu(event, this.url, { edit: () => placeCaret(view, wrapper) });
		});
		return wrapper;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function decorate(state: EditorState, candidates: Candidate[]): DecorationSet {
	const ctx = state.facet(cardContext);
	if (!ctx || candidates.length === 0 || !isLivePreview(state)) return Decoration.none;
	const settings = ctx.settings();
	if (settings.blockCards === "off") return Decoration.none;
	if (ctx.optedOut(state.field(editorInfoField, false)?.file?.path ?? null)) return Decoration.none;

	const ranges: Range<Decoration>[] = [];
	const { selection } = state;
	for (const c of candidates) {
		if (isExcluded(c.url, settings.excludedDomains)) continue;
		if (selection.ranges.some((r) => touches(r.from, r.to, c.lineFrom, c.lineTo))) continue;
		const result = ctx.service.get(c.url);
		let meta: LinkMetadata | null;
		if (result?.ok) meta = result.meta;
		else if (!result && settings.blockCards === "fetch") meta = null;
		else continue;
		const widget = new CardWidget(c.url, meta, lookFor(c.url, settings));
		ranges.push(Decoration.replace({ widget, block: true }).range(c.lineFrom, c.lineTo));
	}
	return Decoration.set(ranges);
}

const cardsField = StateField.define<CardsState>({
	create(state) {
		const candidates = findCandidates(state);
		return { candidates, decorations: decorate(state, candidates) };
	},
	update(value, tr) {
		if (tr.isUserEvent("input.type.compose")) {
			// Never redraw under an IME composition; keep positions in step instead.
			const candidates = value.candidates.map((c) => ({
				url: c.url,
				lineFrom: tr.changes.mapPos(c.lineFrom),
				lineTo: tr.changes.mapPos(c.lineTo, 1),
			}));
			return { candidates, decorations: value.decorations.map(tr.changes) };
		}
		const reparsed = tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState);
		const candidates = reparsed ? findCandidates(tr.state) : value.candidates;
		const redraw =
			reparsed ||
			tr.selection !== undefined ||
			tr.effects.some((e) => e.is(cardRefreshEffect)) ||
			isLivePreview(tr.startState) !== isLivePreview(tr.state);
		return redraw ? { candidates, decorations: decorate(tr.state, candidates) } : value;
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** Whether `pos` sits on a line that is currently drawn as a card, so inline titles leave it alone. */
export function isCarded(state: EditorState, pos: number): boolean {
	const decorations = state.field(cardsField, false)?.decorations;
	if (!decorations) return false;
	let hit = false;
	decorations.between(pos, pos, () => {
		hit = true;
		return false;
	});
	return hit;
}

/** Relays refreshes into the editor and, in fetch mode, queues the visible uncached cards. */
class CardsView {
	private timer: number | null = null;
	private destroyed = false;
	private unsubscribe: () => void;

	constructor(
		private view: EditorView,
		private ctx: InlineContext,
	) {
		this.unsubscribe = ctx.onRefresh(() => this.scheduleRefresh());
		this.prefetch();
	}

	update(update: ViewUpdate): void {
		this.view = update.view;
		const refreshed = update.transactions.some((tr) => tr.effects.some((e) => e.is(cardRefreshEffect)));
		if (update.docChanged || update.viewportChanged || refreshed) this.prefetch();
	}

	destroy(): void {
		this.destroyed = true;
		this.unsubscribe();
		if (this.timer !== null) this.view.dom.win.clearTimeout(this.timer);
	}

	/** Coalesced to the next tick: dispatching from a promise callback can land mid-update. */
	private scheduleRefresh(): void {
		if (this.timer !== null || this.destroyed) return;
		this.timer = this.view.dom.win.setTimeout(() => {
			this.timer = null;
			if (this.destroyed || this.view.composing) return;
			this.view.dispatch({ effects: cardRefreshEffect.of(null) });
		}, 0);
	}

	private prefetch(): void {
		const settings = this.ctx.settings();
		if (settings.blockCards !== "fetch" || !isLivePreview(this.view.state)) return;
		const { from, to } = this.view.viewport;
		const candidates = this.view.state.field(cardsField, false)?.candidates ?? [];
		const urls = candidates
			.filter((c) => c.lineTo >= from && c.lineFrom <= to)
			.map((c) => c.url)
			.filter((url) => !isExcluded(url, settings.excludedDomains) && !this.ctx.service.get(url));
		if (urls.length > 0) this.ctx.prefetch.enqueue(urls);
	}
}

export function cardEditorExtension(ctx: InlineContext) {
	return [cardContext.of(ctx), cardsField, ViewPlugin.define((view) => new CardsView(view, ctx))];
}
