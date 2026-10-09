import { isHttpUrl } from "../inline/classify";

/**
 * A URL alone on its line: optional `<...>` autolink brackets, at most three
 * spaces of indent (four would make it an indented code block), nothing else.
 */
const STANDALONE_RE = /^ {0,3}(<)?(https?:\/\/[^\s<>]+)(>)?[ \t]*$/i;

export interface StandaloneLink {
	url: string;
	/** Offsets of the URL itself within the line, brackets excluded. */
	start: number;
	end: number;
}

export function standaloneUrl(lineText: string): StandaloneLink | null {
	const match = STANDALONE_RE.exec(lineText);
	if (!match) return null;
	const [, open, url, close] = match;
	if (Boolean(open) !== Boolean(close) || !isHttpUrl(url)) return null;
	const start = lineText.indexOf(url);
	return { url, start, end: start + url.length };
}

const HEADING_RE = /^ {0,3}#{1,6}(\s|$)/;
const RULE_RE = /^ {0,3}([-*_])( *\1){2,} *$/;

function isBoundary(line: string | undefined): boolean {
	return line === undefined || line.trim() === "" || HEADING_RE.test(line) || RULE_RE.test(line);
}

/**
 * Whether the line is its own paragraph, so Live Preview agrees with Reading
 * view: a URL directly under a line of text is part of that paragraph there.
 */
export function isOwnParagraph(previous: string | undefined, next: string | undefined): boolean {
	return isBoundary(previous) && (next === undefined || next.trim() === "" || HEADING_RE.test(next));
}
