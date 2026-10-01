import { requestUrl } from "obsidian";
import { metadataForNonHtml, parseMetadata } from "./parse";
import type { MetadataResult } from "./types";

/** `requestUrl` has no abort; we race it so a hung host cannot pin a popover in "loading" forever. */
const FETCH_TIMEOUT_MS = 10_000;

/** A desktop-browser UA: many sites serve OG tags only to browsers, and some block the default Electron UA. */
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	// `window.*` timers: Obsidian runs views in popout windows where bare globals can be the wrong realm.
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
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

export async function fetchMetadata(url: string): Promise<MetadataResult> {
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
			return { ok: false, error: `HTTP ${response.status}` };
		}

		const contentType = headerValue(response.headers, "content-type")?.split(";")[0].trim().toLowerCase() ?? null;
		const isHtml = contentType === null || contentType.includes("html") || contentType.includes("xml");
		if (!isHtml) {
			return { ok: true, meta: metadataForNonHtml(url, contentType) };
		}

		return { ok: true, meta: parseMetadata(response.text, url, contentType) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn("[link-peek] fetch failed:", url, message);
		return { ok: false, error: message };
	}
}
