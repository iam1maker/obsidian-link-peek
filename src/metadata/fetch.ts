import { requestUrl } from "obsidian";
import { decodeHtml } from "./charset";
import { classifyStatus, looksLikeChallenge } from "./errors";
import { metadataForNonHtml, parseMetadata } from "./parse";
import { fillFromOembed, needsOembed, siteResolver } from "./sites";
import type { MetadataResult } from "./types";

/** `requestUrl` has no abort; we race it so a hung host cannot pin a popover in "loading" forever. */
const FETCH_TIMEOUT_MS = 10_000;
/** JSON side requests (oEmbed, site APIs) are small; do not let them double the wait. */
const JSON_TIMEOUT_MS = 6_000;

/** A desktop-browser UA: many sites serve OG tags only to browsers, and some block the default Electron UA. */
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

class TimeoutError extends Error {
	constructor(ms: number) {
		super(`Timed out after ${ms}ms`);
		this.name = "TimeoutError";
	}
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	// `window.*` timers: Obsidian runs views in popout windows where bare globals can be the wrong realm.
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new TimeoutError(ms)), ms);
		promise.then(
			(v) => {
				window.clearTimeout(timer);
				resolve(v);
			},
			(e: unknown) => {
				window.clearTimeout(timer);
				reject(e instanceof Error ? e : new Error(String(e)));
			},
		);
	});
}

function headerValue(headers: Record<string, string>, name: string): string | null {
	const wanted = name.toLowerCase();
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === wanted) return value;
	}
	return null;
}

/** GET a JSON endpoint; null on any failure, callers always have a fallback. */
export async function fetchJson(url: string): Promise<unknown | null> {
	try {
		const response = await timeout(
			requestUrl({ url, method: "GET", headers: { Accept: "application/json", "User-Agent": USER_AGENT }, throw: false }),
			JSON_TIMEOUT_MS,
		);
		if (response.status < 200 || response.status >= 300) return null;
		return response.json ?? JSON.parse(response.text);
	} catch (error) {
		console.debug("[link-peek] json fetch failed:", url, error instanceof Error ? error.message : error);
		return null;
	}
}

export async function fetchMetadata(url: string): Promise<MetadataResult> {
	// Sites whose HTML is useless to a non-browser get their public API first; any failure falls through.
	const resolver = siteResolver(url);
	if (resolver) {
		try {
			const meta = await resolver(url, fetchJson);
			if (meta) return { ok: true, meta };
		} catch (error) {
			console.debug("[link-peek] site resolver failed, using generic fetch:", url, error);
		}
	}

	try {
		const response = await timeout(
			requestUrl({
				url,
				method: "GET",
				headers: {
					Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en,zh;q=0.8",
					"User-Agent": USER_AGENT,
				},
				throw: false,
			}),
			FETCH_TIMEOUT_MS,
		);

		if (response.status < 200 || response.status >= 300) {
			return { ok: false, error: `HTTP ${response.status}`, kind: classifyStatus(response.status) };
		}

		const contentTypeHeader = headerValue(response.headers, "content-type");
		const contentType = contentTypeHeader?.split(";")[0].trim().toLowerCase() ?? null;
		const isHtml = contentType === null || contentType.includes("html") || contentType.includes("xml");
		if (!isHtml) {
			return { ok: true, meta: metadataForNonHtml(url, contentType) };
		}

		const html = decodeHtml(response.arrayBuffer, contentTypeHeader);
		let meta = parseMetadata(html, url, contentType);

		if (needsOembed(meta) && meta.oembedUrl) {
			const oembed = await fetchJson(meta.oembedUrl);
			if (oembed) meta = fillFromOembed(meta, oembed);
		}

		if (looksLikeChallenge(meta, html.length)) {
			return { ok: false, error: "The site returned a verification page", kind: "blocked" };
		}
		if (!meta.title && !meta.description) {
			return { ok: false, error: "No title or description in the page", kind: "empty" };
		}

		return { ok: true, meta };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn("[link-peek] fetch failed:", url, message);
		return { ok: false, error: message, kind: error instanceof TimeoutError ? "timeout" : "network" };
	}
}
