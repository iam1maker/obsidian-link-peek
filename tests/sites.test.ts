import { describe, expect, it } from "vitest";
import {
	fillFromOembed,
	metaFromWikipediaSummary,
	needsOembed,
	redditOembedUrl,
	siteResolver,
	wikipediaSummaryUrl,
} from "../src/metadata/sites";
import type { LinkMetadata } from "../src/metadata/types";

const bare = (url: string): LinkMetadata => ({
	url,
	title: null,
	description: null,
	image: null,
	favicon: null,
	siteName: null,
	contentType: "text/html",
});

describe("wikipedia", () => {
	it("maps article URLs (desktop and mobile) to the REST summary endpoint", () => {
		expect(wikipediaSummaryUrl("https://zh.wikipedia.org/wiki/%E5%B0%8F%E7%99%BD")).toBe(
			"https://zh.wikipedia.org/api/rest_v1/page/summary/%E5%B0%8F%E7%99%BD",
		);
		expect(wikipediaSummaryUrl("https://en.m.wikipedia.org/wiki/Obsidian_(software)#History")).toBe(
			"https://en.wikipedia.org/api/rest_v1/page/summary/Obsidian_(software)",
		);
		expect(wikipediaSummaryUrl("https://www.wikipedia.org/")).toBeNull();
		expect(wikipediaSummaryUrl("https://en.wikipedia.org/w/index.php?search=x")).toBeNull();
	});

	it("builds metadata from a summary response", () => {
		const meta = metaFromWikipediaSummary("https://en.wikipedia.org/wiki/Obsidian", {
			title: "Obsidian",
			extract: "Obsidian is a naturally occurring volcanic glass.",
			thumbnail: { source: "https://upload.wikimedia.org/x.jpg" },
			content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Obsidian" } },
		});
		expect(meta?.title).toBe("Obsidian");
		expect(meta?.description).toContain("volcanic glass");
		expect(meta?.image).toBe("https://upload.wikimedia.org/x.jpg");
		expect(meta?.siteName).toBe("Wikipedia");
		expect(metaFromWikipediaSummary("https://en.wikipedia.org/wiki/X", { type: "not_found" })).toBeNull();
	});
});

describe("reddit", () => {
	it("only handles post URLs", () => {
		expect(redditOembedUrl("https://www.reddit.com/r/ObsidianMD/comments/abc/title/")).toBe(
			"https://www.reddit.com/oembed?url=https%3A%2F%2Fwww.reddit.com%2Fr%2FObsidianMD%2Fcomments%2Fabc%2Ftitle%2F",
		);
		expect(redditOembedUrl("https://old.reddit.com/r/ObsidianMD/")).toBeNull();
		expect(redditOembedUrl("https://example.com/comments/")).toBeNull();
	});
});

describe("oEmbed fill-in", () => {
	it("is only requested when title or description is missing", () => {
		expect(needsOembed({ ...bare("https://a"), title: "T", description: "D" })).toBe(false);
		expect(needsOembed({ ...bare("https://a"), title: "T" })).toBe(true);
	});

	it("fills gaps without overwriting what the page already said", () => {
		const meta = fillFromOembed(
			{ ...bare("https://x.com/a/status/1"), title: "Page title" },
			{ author_name: "Someone", html: '<blockquote><p lang="en">the bird is freed</p>&mdash; Someone</blockquote>', provider_name: "X", thumbnail_url: "https://img" },
		);
		expect(meta.title).toBe("Page title");
		expect(meta.description).toBe("the bird is freed — Someone");
		expect(meta.image).toBe("https://img");
		expect(meta.siteName).toBe("X");
	});

	it("falls back to the author when there is nothing else", () => {
		const meta = fillFromOembed(bare("https://a"), { author_name: "Ann" });
		expect(meta.title).toBe("Ann");
		expect(meta.description).toBe("by Ann");
		expect(fillFromOembed(bare("https://a"), null)).toEqual(bare("https://a"));
	});
});

describe("siteResolver", () => {
	it("picks resolvers by host and ignores everything else", () => {
		expect(siteResolver("https://de.wikipedia.org/wiki/Berlin")).not.toBeNull();
		expect(siteResolver("https://www.reddit.com/r/x/comments/1/")).not.toBeNull();
		expect(siteResolver("https://github.com/x")).toBeNull();
		expect(siteResolver("not a url")).toBeNull();
	});
});
