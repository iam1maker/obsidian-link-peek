import { hostnameOf, textFromHtml } from "./parse";
import type { LinkMetadata } from "./types";

/**
 * Per-site handling, kept deliberately short. Two kinds:
 * - resolvers: the HTML is useless to a non-browser (Reddit's shell, Wikipedia's
 *   generic description), but a public JSON endpoint has what we need
 * - oEmbed fill-in: generic, for any page that advertises an endpoint and whose
 *   OG tags are missing (X when it serves the JS shell, blogs without OG)
 */

export type JsonFetcher = (url: string) => Promise<unknown>;
export type SiteResolver = (url: string, fetchJson: JsonFetcher) => Promise<LinkMetadata | null>;

interface OembedLike {
	title?: unknown;
	author_name?: unknown;
	provider_name?: unknown;
	thumbnail_url?: unknown;
	html?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

/** oEmbed is only worth a second request when the page itself told us nothing useful. */
export function needsOembed(meta: LinkMetadata): boolean {
	return !meta.title || !meta.description;
}

export function fillFromOembed(meta: LinkMetadata, data: unknown): LinkMetadata {
	if (!data || typeof data !== "object") return meta;
	const o = data as OembedLike;
	const author = str(o.author_name);
	const snippet = str(o.html) ? textFromHtml(o.html as string) : null;
	return {
		...meta,
		title: meta.title ?? str(o.title) ?? author,
		description: meta.description ?? snippet ?? (author ? `by ${author}` : null),
		image: meta.image ?? str(o.thumbnail_url),
		siteName: str(o.provider_name) ?? meta.siteName,
	};
}

// --- Wikipedia: OG has the title but the description is the site slogan; the REST summary has the real extract.

const WIKIPEDIA_HOST_RE = /^([a-z][a-z-]*)\.(?:m\.)?wikipedia\.org$/i;

export function wikipediaSummaryUrl(url: string): string | null {
	try {
		const u = new URL(url);
		const lang = WIKIPEDIA_HOST_RE.exec(u.hostname)?.[1];
		const title = /^\/wiki\/([^/?#]+)/.exec(u.pathname)?.[1];
		if (!lang || !title) return null;
		return `https://${lang.toLowerCase()}.wikipedia.org/api/rest_v1/page/summary/${title}`;
	} catch {
		return null;
	}
}

interface WikiSummary {
	title?: unknown;
	extract?: unknown;
	description?: unknown;
	thumbnail?: { source?: unknown };
	content_urls?: { desktop?: { page?: unknown } };
}

export function metaFromWikipediaSummary(url: string, data: unknown): LinkMetadata | null {
	if (!data || typeof data !== "object") return null;
	const w = data as WikiSummary;
	const title = str(w.title);
	if (!title) return null;
	return {
		url: str(w.content_urls?.desktop?.page) ?? url,
		title,
		description: str(w.extract) ?? str(w.description),
		image: str(w.thumbnail?.source),
		favicon: "https://www.wikipedia.org/static/favicon/wikipedia.ico",
		siteName: "Wikipedia",
		contentType: "text/html",
	};
}

const resolveWikipedia: SiteResolver = async (url, fetchJson) => {
	const api = wikipediaSummaryUrl(url);
	return api ? metaFromWikipediaSummary(url, await fetchJson(api)) : null;
};

// --- Reddit: serves an empty shell to anything it does not recognise as a browser; oEmbed is public.

export function redditOembedUrl(url: string): string | null {
	const host = hostnameOf(url);
	if (!host || !/(^|\.)reddit\.com$/i.test(host)) return null;
	if (!/\/comments\//.test(url)) return null;
	return `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`;
}

const resolveReddit: SiteResolver = async (url, fetchJson) => {
	const api = redditOembedUrl(url);
	if (!api) return null;
	const data = await fetchJson(api);
	if (!data) return null;
	const base: LinkMetadata = {
		url,
		title: null,
		description: null,
		image: null,
		favicon: "https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png",
		siteName: "Reddit",
		contentType: "text/html",
	};
	const filled = fillFromOembed(base, data);
	// Reddit's oEmbed has no `title`; the snippet's first line is the post title.
	if (!filled.title && filled.description) {
		const snippet = filled.description;
		const author = str((data as OembedLike).author_name);
		return { ...filled, title: snippet.slice(0, 120), description: author ? `u/${author}` : null };
	}
	return filled.title ? filled : null;
};

const RESOLVERS: Array<[test: (host: string) => boolean, resolver: SiteResolver]> = [
	[(host) => WIKIPEDIA_HOST_RE.test(host), resolveWikipedia],
	[(host) => /(^|\.)reddit\.com$/i.test(host), resolveReddit],
];

export function siteResolver(url: string): SiteResolver | null {
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return null;
	}
	return RESOLVERS.find(([test]) => test(host))?.[1] ?? null;
}
