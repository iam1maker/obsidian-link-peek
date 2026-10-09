import { describe, expect, it } from "vitest";
import { decodeEntities, displayUrl, headOf, parseMetadata, textFromHtml } from "../src/metadata/parse";

const BASE = "https://example.com/articles/42";

describe("parseMetadata", () => {
	it("prefers OpenGraph over Twitter over HTML fallbacks", () => {
		const html = `
			<html><head>
				<title>HTML title</title>
				<meta name="description" content="html desc">
				<meta name="twitter:title" content="Twitter title">
				<meta property="og:title" content="OG title">
				<meta property="og:description" content="OG desc">
				<meta property="og:image" content="https://cdn.example.com/a.png">
				<meta property="og:site_name" content="Example">
			</head><body></body></html>`;
		const meta = parseMetadata(html, BASE);
		expect(meta.title).toBe("OG title");
		expect(meta.description).toBe("OG desc");
		expect(meta.image).toBe("https://cdn.example.com/a.png");
		expect(meta.siteName).toBe("Example");
	});

	it("falls back to <title>, meta description and hostname", () => {
		const html = `<head><title>  Just a   title </title><meta name="description" content="plain"></head>`;
		const meta = parseMetadata(html, BASE);
		expect(meta.title).toBe("Just a title");
		expect(meta.description).toBe("plain");
		expect(meta.image).toBeNull();
		expect(meta.siteName).toBe("example.com");
	});

	it("resolves relative image and favicon URLs against the page", () => {
		const html = `<head>
			<meta property="og:image" content="/img/cover.jpg">
			<link rel="shortcut icon" href="../static/fav.ico">
		</head>`;
		const meta = parseMetadata(html, BASE);
		expect(meta.image).toBe("https://example.com/img/cover.jpg");
		expect(meta.favicon).toBe("https://example.com/static/fav.ico");
	});

	it("prefers rel=icon over apple-touch-icon and defaults to /favicon.ico", () => {
		const withBoth = `<link rel="apple-touch-icon" href="/apple.png"><link rel="icon" href="/icon.svg">`;
		expect(parseMetadata(withBoth, BASE).favicon).toBe("https://example.com/icon.svg");
		expect(parseMetadata("<head></head>", BASE).favicon).toBe("https://example.com/favicon.ico");
	});

	it("handles single-quoted and unquoted attributes and content-before-property order", () => {
		const html = `<meta content='Quoted &amp; decoded' property='og:title'><meta content=bare name=description>`;
		const meta = parseMetadata(html, BASE);
		expect(meta.title).toBe("Quoted & decoded");
		expect(meta.description).toBe("bare");
	});

	it("keeps the first occurrence of a repeated tag", () => {
		const html = `<meta property="og:image" content="/first.png"><meta property="og:image" content="/second.png">`;
		expect(parseMetadata(html, BASE).image).toBe("https://example.com/first.png");
	});

	it("uses og:url / canonical for the resolved URL and ignores non-http schemes", () => {
		const html = `<link rel="canonical" href="https://example.com/canonical"><meta property="og:image" content="javascript:alert(1)">`;
		const meta = parseMetadata(html, BASE);
		expect(meta.url).toBe("https://example.com/canonical");
		expect(meta.image).toBeNull();
	});

	it("scans a large head-less document up to the budget, not beyond", () => {
		const tag = `<meta property="og:title" content="found">`;
		expect(parseMetadata("<html>" + "x".repeat(900 * 1024) + tag, BASE).title).toBe("found");
		expect(parseMetadata("<html>" + "x".repeat(2049 * 1024) + tag, BASE).title).toBeNull();
	});
});

describe("decodeEntities", () => {
	it("decodes named, decimal and hex entities and leaves unknown ones alone", () => {
		expect(decodeEntities("a &amp; b &#39;c&#x27; &hellip; &bogus;")).toBe("a & b 'c' … &bogus;");
	});
});

describe("displayUrl", () => {
	it("strips scheme, www and trailing slash and decodes escapes", () => {
		expect(displayUrl("https://www.news.ycombinator.com/")).toBe("news.ycombinator.com");
		expect(displayUrl("https://zh.wikipedia.org/wiki/%E9%BB%91%E6%9B%9C%E7%9F%B3")).toBe("zh.wikipedia.org/wiki/黑曜石");
	});

	it("truncates long urls with an ellipsis and survives malformed escapes", () => {
		const long = "https://example.com/" + "a".repeat(100);
		const shown = displayUrl(long, 30);
		expect(shown.length).toBe(30);
		expect(shown.endsWith("…")).toBe(true);
		expect(displayUrl("https://example.com/%E0%A4%A")).toBe("example.com/%E0%A4%A");
	});
});

describe("headOf", () => {
	it("cuts at </head> even when the head is huge, and caps when there is none", () => {
		const html = "<head>" + "x".repeat(900_000) + "<title>late</title></head><body>" + "y".repeat(100) + "</body>";
		const head = headOf(html);
		expect(head).toContain("<title>late</title>");
		expect(head).not.toContain("yyy");
		expect(headOf("a".repeat(3 * 1024 * 1024)).length).toBe(2 * 1024 * 1024);
	});
});

describe("oEmbed discovery", () => {
	it("picks up the json+oembed alternate link, resolved against the page", () => {
		const html = '<head><link rel="alternate" type="application/json+oembed" href="/oembed?url=x"><title>t</title></head>';
		expect(parseMetadata(html, "https://example.com/post").oembedUrl).toBe("https://example.com/oembed?url=x");
		expect(parseMetadata("<head><title>t</title></head>", "https://example.com/").oembedUrl).toBeNull();
	});
});

describe("textFromHtml", () => {
	it("flattens an oEmbed snippet to one line of text", () => {
		expect(textFromHtml('<blockquote><p lang="en">the bird<br>is freed</p>&mdash; Elon</blockquote>')).toBe("the bird is freed — Elon");
		expect(textFromHtml("<div></div>")).toBeNull();
	});
});
