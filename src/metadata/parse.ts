import type { LinkMetadata } from "./types";

/**
 * Pure, DOM-free OpenGraph / Twitter Card / HTML metadata extraction.
 * Regex-based on purpose: it runs identically in Obsidian and under node tests,
 * and we only ever need `<head>`-level tags.
 */

const META_TAG_RE = /<meta\b[^>]*>/gi;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * Only parse the head: bodies can be megabytes and never carry OG tags. Some
 * heads are huge though (YouTube puts its <title> after 700 KB of inline
 * JSON), so cut at `</head>` when we can find it and only cap otherwise.
 */
const MAX_SCAN_CHARS = 2 * 1024 * 1024;

export function headOf(html: string): string {
	const end = html.indexOf("</head>");
	if (end !== -1) return html.slice(0, end);
	return html.length > MAX_SCAN_CHARS ? html.slice(0, MAX_SCAN_CHARS) : html;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	hellip: "…",
	mdash: "—",
	ndash: "–",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
	copy: "©",
	reg: "®",
	trade: "™",
};

export function decodeEntities(input: string): string {
	return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
		if (body[0] === "#") {
			const isHex = body[1] === "x" || body[1] === "X";
			const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		const named = NAMED_ENTITIES[body.toLowerCase()];
		return named ?? whole;
	});
}

function parseAttrs(tag: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	ATTR_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = ATTR_RE.exec(tag)) !== null) {
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		attrs[m[1].toLowerCase()] = decodeEntities(value.trim());
	}
	return attrs;
}

function cleanText(value: string | undefined | null): string | null {
	if (!value) return null;
	const text = decodeEntities(value).replace(/\s+/g, " ").trim();
	return text.length > 0 ? text : null;
}

function resolveUrl(candidate: string | null, base: string): string | null {
	if (!candidate) return null;
	try {
		const resolved = new URL(candidate, base);
		if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
		return resolved.toString();
	} catch {
		return null;
	}
}

/** Pick the first non-empty value among ordered candidates. */
function first(...values: Array<string | null | undefined>): string | null {
	for (const v of values) {
		const cleaned = cleanText(v);
		if (cleaned) return cleaned;
	}
	return null;
}

const ICON_REL_PRIORITY = ["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"];

export function parseMetadata(html: string, baseUrl: string, contentType: string | null = "text/html"): LinkMetadata {
	const head = headOf(html);

	const meta: Record<string, string> = {};
	for (const tag of head.match(META_TAG_RE) ?? []) {
		const attrs = parseAttrs(tag);
		const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
		const content = attrs.content;
		// First occurrence wins: OG spec says the first tag is the primary one.
		if (key && content !== undefined && !(key in meta)) meta[key] = content;
	}

	let favicon: string | null = null;
	let faviconRank = Number.POSITIVE_INFINITY;
	let canonical: string | null = null;
	let oembed: string | null = null;
	for (const tag of head.match(LINK_TAG_RE) ?? []) {
		const attrs = parseAttrs(tag);
		const rel = (attrs.rel ?? "").toLowerCase().trim();
		if (!attrs.href) continue;
		if (rel === "canonical" && !canonical) canonical = attrs.href;
		if (rel === "alternate" && (attrs.type ?? "").toLowerCase() === "application/json+oembed" && !oembed) oembed = attrs.href;
		const rank = ICON_REL_PRIORITY.indexOf(rel);
		if (rank !== -1 && rank < faviconRank) {
			faviconRank = rank;
			favicon = attrs.href;
		}
	}

	const titleTag = TITLE_RE.exec(head)?.[1];
	const resolvedUrl = resolveUrl(meta["og:url"] ?? canonical, baseUrl) ?? baseUrl;

	return {
		url: resolvedUrl,
		title: first(meta["og:title"], meta["twitter:title"], titleTag),
		description: first(meta["og:description"], meta["twitter:description"], meta["description"]),
		image: resolveUrl(first(meta["og:image"], meta["og:image:url"], meta["twitter:image"], meta["twitter:image:src"]), baseUrl),
		favicon: resolveUrl(favicon, baseUrl) ?? resolveUrl("/favicon.ico", baseUrl),
		siteName: first(meta["og:site_name"], meta["application-name"]) ?? hostnameOf(baseUrl),
		contentType,
		oembedUrl: resolveUrl(oembed, baseUrl),
	};
}

/** Strip tags and collapse whitespace: oEmbed `html` snippets are the only HTML we show as text. */
export function textFromHtml(html: string): string | null {
	return cleanText(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

const DISPLAY_URL_MAX = 80;

/**
 * A URL as a human would read it: no scheme, no `www.`, no trailing slash,
 * percent-encoding decoded, cut with an ellipsis when long. Used as the card's
 * description when the page has none, so it never looks empty.
 */
export function displayUrl(url: string, max: number = DISPLAY_URL_MAX): string {
	let text = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
	try {
		text = decodeURIComponent(text);
	} catch {
		// Malformed escape sequences: keep the raw form.
	}
	text = text.replace(/\/$/, "");
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function hostnameOf(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/** Metadata for responses that are not HTML (PDF, image, …): nothing to parse, show the file name. */
export function metadataForNonHtml(url: string, contentType: string | null): LinkMetadata {
	let title: string | null = null;
	try {
		const path = new URL(url).pathname;
		const last = path.split("/").filter(Boolean).pop();
		title = last ? decodeURIComponent(last) : null;
	} catch {
		title = null;
	}
	const isImage = contentType?.startsWith("image/") ?? false;
	return {
		url,
		title,
		description: contentType,
		image: isImage ? url : null,
		favicon: resolveUrl("/favicon.ico", url),
		siteName: hostnameOf(url),
		contentType,
	};
}
