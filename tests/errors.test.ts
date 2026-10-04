import { describe, expect, it } from "vitest";
import { classifyStatus, describeError, looksLikeChallenge } from "../src/metadata/errors";
import type { LinkMetadata } from "../src/metadata/types";

const meta = (title: string | null, description: string | null = null): LinkMetadata => ({
	url: "https://a",
	title,
	description,
	image: null,
	favicon: null,
	siteName: null,
	contentType: "text/html",
});

describe("classifyStatus", () => {
	it("separates blocked, missing and other failures", () => {
		expect(classifyStatus(403)).toBe("blocked");
		expect(classifyStatus(429)).toBe("blocked");
		expect(classifyStatus(404)).toBe("notfound");
		expect(classifyStatus(500)).toBe("http");
	});
});

describe("looksLikeChallenge", () => {
	it("recognises bot walls by title, in English and Chinese", () => {
		expect(looksLikeChallenge(meta("Just a moment..."), 50_000)).toBe(true);
		expect(looksLikeChallenge(meta("环境异常 - 微信"), 30_000)).toBe(true);
		expect(looksLikeChallenge(meta("Attention Required! | Cloudflare"), 9_000)).toBe(true);
	});

	it("treats a tiny titleless shell as a wall but a real page as fine", () => {
		expect(looksLikeChallenge(meta(null), 650)).toBe(true);
		expect(looksLikeChallenge(meta(null), 40_000)).toBe(false);
		expect(looksLikeChallenge(meta("Reddit"), 8_000)).toBe(false);
	});
});

describe("describeError", () => {
	it("gives each kind its own copy and keeps the raw message for the rest", () => {
		expect(describeError("blocked", "HTTP 403")).toBe("This site blocks previews");
		expect(describeError("timeout", "x")).toContain("respond");
		expect(describeError("http", "HTTP 500")).toContain("HTTP 500");
		expect(describeError(undefined, "boom")).toContain("boom");
		expect(describeError("empty", "x")).toContain("no preview metadata");
	});
});
