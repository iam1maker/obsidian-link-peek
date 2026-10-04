import type { ErrorKind, LinkMetadata } from "./types";

/** Map an HTTP status to what the card should say. */
export function classifyStatus(status: number): ErrorKind {
	if (status === 401 || status === 403 || status === 429 || status === 503) return "blocked";
	if (status === 404 || status === 410) return "notfound";
	return "http";
}

/**
 * Pages that come back 200 but are a bot wall. Matched against the <title>,
 * which is what Cloudflare, Akamai, WeChat and friends set on their walls.
 */
const CHALLENGE_TITLE_RE =
	/just a moment|attention required|access denied|are you a (?:human|robot)|verify you are|security check|captcha|请稍候|环境异常|访问验证|安全验证|请完成验证/i;

export function looksLikeChallenge(meta: LinkMetadata, bodyLength: number): boolean {
	if (meta.title && CHALLENGE_TITLE_RE.test(meta.title)) return true;
	// A tiny document with neither title nor description is a shell, not a page.
	return !meta.title && !meta.description && bodyLength < 2048;
}

/** Human copy per failure kind; the raw error stays available as a tooltip. */
export function describeError(kind: ErrorKind | undefined, error: string): string {
	switch (kind) {
		case "blocked":
			return "This site blocks previews";
		case "notfound":
			return "Page not found";
		case "timeout":
			return "The site did not respond in time";
		case "network":
			return "Could not reach the site";
		case "empty":
			return "This page has no preview metadata";
		case "http":
			return `The site returned an error (${error})`;
		default:
			return `Preview unavailable · ${error}`;
	}
}
