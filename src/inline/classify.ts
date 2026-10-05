/**
 * Pure rules for inline decoration. Obsidian's editor is a HyperMD-style
 * stream parser: each syntax node's name is its token classes joined by `_`
 * (e.g. `list-1_url`, `formatting-link-string_string_url`). Obsidian decides
 * what counts as a link, so we follow its tokens rather than our own regex:
 * a URL glued to CJK text (`参见https://…`) is plain text to Obsidian in both
 * Live Preview and Reading view, and must stay plain here too.
 */

export type UrlNodeKind = "bare" | "autolink" | "target";

/** Token classes that mean "not prose": never decorate inside these. */
const SKIP_CLASSES = ["comment", "inline-code", "hmd-codeblock", "math", "hmd-frontmatter", "hmd-internal-link", "tag"];

export function tokenClasses(nodeName: string): string[] {
	return nodeName.split("_");
}

/**
 * What a syntax node is, as far as inline decoration cares.
 * - bare: an autolinked plain URL
 * - autolink: the URL inside `<…>`
 * - target: the `(url)` part of `[text](url)` or of an image
 */
export function classifyNode(nodeName: string): UrlNodeKind | null {
	const classes = tokenClasses(nodeName);
	if (!classes.includes("url")) return null;
	if (classes.some((c) => SKIP_CLASSES.includes(c))) return null;
	// The `(` and `)` around a link target carry `url` too; they are punctuation, not the URL.
	if (classes.includes("formatting-link-string")) return null;
	if (classes.includes("string")) return "target";
	if (classes.includes("formatting-link")) return "autolink";
	return "bare";
}

export function isHttpUrl(text: string): boolean {
	return /^https?:\/\/\S+$/i.test(text);
}

/**
 * For a `[text](url)` target starting at `urlFrom` (offset in the line, just
 * after `(`), find where the link starts: the offset of its `[`, and whether a
 * `!` makes it an image. Walks back over balanced brackets so `[a [b] c](url)`
 * works. Returns null when the line does not have the expected shape.
 */
export function markdownLinkStart(lineText: string, urlFrom: number): { start: number; isImage: boolean } | null {
	const open = urlFrom - 1;
	if (lineText[open] !== "(" || lineText[open - 1] !== "]") return null;
	let depth = 0;
	for (let i = open - 1; i >= 0; i--) {
		const ch = lineText[i];
		if (ch === "]") depth++;
		else if (ch === "[") {
			depth--;
			if (depth === 0) return { start: i, isImage: lineText[i - 1] === "!" };
		}
	}
	return null;
}

/** `link-peek: off` (or `false`) in a note's properties turns inline decoration off for that note. */
export function optedOut(value: unknown): boolean {
	if (value === false) return true;
	if (typeof value !== "string") return false;
	const v = value.trim().toLowerCase();
	return v === "off" || v === "false" || v === "no";
}

/** Whether a selection range touches `[from, to]`; touching ranges are revealed as raw text. */
export function touches(selFrom: number, selTo: number, from: number, to: number): boolean {
	return selFrom <= to && selTo >= from;
}

function safeDecode(value: string): string {
	try {
		return decodeURI(value);
	} catch {
		return value;
	}
}

/** In Reading view a bare URL renders as an anchor whose text is its own href. */
export function isBareAnchor(text: string, href: string): boolean {
	const t = text.trim();
	if (!t || !isHttpUrl(href)) return false;
	return t === href || safeDecode(t) === safeDecode(href);
}
