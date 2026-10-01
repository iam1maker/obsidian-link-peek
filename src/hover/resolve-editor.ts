import type { EditorView } from "@codemirror/view";

/**
 * Find the external URL under a pointer position inside a CodeMirror 6 editor.
 *
 * We deliberately work from the document text, not the DOM: in Live Preview the
 * `(url)` half of `[text](url)` is folded away unless the cursor is on the line,
 * so the hovered DOM node carries no href. Mapping the pointer to a document
 * offset and scanning that line's source handles folded and unfolded links alike.
 */

// `[text](url "title")` — title is optional; url stops at whitespace or `)`.
const MD_LINK_RE = /\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\s*\)/g;
// `<https://…>` autolinks and bare URLs. Trailing punctuation is trimmed afterwards.
const BARE_URL_RE = /<?(https?:\/\/[^\s<>"'`\])]+)>?/g;

const TRAILING_PUNCTUATION = /[.,;:!?'"”’)]+$/;

export interface UrlSpan {
	url: string;
	from: number;
	to: number;
}

export function trimTrailingPunctuation(url: string): string {
	// Keep a closing paren when the URL itself opened one (Wikipedia-style `Foo_(bar)`).
	let trimmed = url.replace(TRAILING_PUNCTUATION, "");
	while (url.length > trimmed.length && url[trimmed.length] === ")" && countChar(trimmed, "(") > countChar(trimmed, ")")) {
		trimmed = url.slice(0, trimmed.length + 1);
	}
	return trimmed;
}

function countChar(text: string, char: string): number {
	let count = 0;
	for (const c of text) if (c === char) count++;
	return count;
}

/** All URL spans in one line of Markdown source, with offsets relative to the line start. */
export function findUrlSpans(lineText: string): UrlSpan[] {
	const spans: UrlSpan[] = [];
	const covered: Array<[number, number]> = [];

	MD_LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = MD_LINK_RE.exec(lineText)) !== null) {
		const from = m.index;
		const to = from + m[0].length;
		spans.push({ url: m[2], from, to });
		covered.push([from, to]);
	}

	BARE_URL_RE.lastIndex = 0;
	while ((m = BARE_URL_RE.exec(lineText)) !== null) {
		const from = m.index;
		const to = from + m[0].length;
		if (covered.some(([a, b]) => from >= a && to <= b)) continue;
		const url = trimTrailingPunctuation(m[1]);
		spans.push({ url, from, to: from + url.length + (m[0].startsWith("<") ? 1 : 0) });
	}

	return spans;
}

export function urlAtOffset(lineText: string, offset: number): string | null {
	for (const span of findUrlSpans(lineText)) {
		if (offset >= span.from && offset < span.to) return span.url;
	}
	return null;
}

export function urlAtPointer(view: EditorView, event: MouseEvent): string | null {
	const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
	if (pos === null) return null;
	const line = view.state.doc.lineAt(pos);
	return urlAtOffset(line.text, pos - line.from);
}
