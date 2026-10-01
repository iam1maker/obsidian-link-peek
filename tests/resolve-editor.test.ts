import { describe, expect, it } from "vitest";
import { findUrlSpans, trimTrailingPunctuation, urlAtOffset } from "../src/hover/resolve-editor";

describe("findUrlSpans", () => {
	it("maps the whole [text](url) span to its url, including the folded text part", () => {
		const line = "see [Obsidian](https://obsidian.md/plugins) for more";
		const spans = findUrlSpans(line);
		expect(spans).toHaveLength(1);
		expect(spans[0].url).toBe("https://obsidian.md/plugins");
		// hovering the visible word "Obsidian" (offset 6) resolves the hidden url
		expect(urlAtOffset(line, 6)).toBe("https://obsidian.md/plugins");
		expect(urlAtOffset(line, 1)).toBeNull();
	});

	it("finds bare and autolinked urls and trims trailing punctuation", () => {
		const line = "a https://a.com/x, then <https://b.com/y> and https://c.com/z.";
		const urls = findUrlSpans(line).map((s) => s.url);
		expect(urls).toEqual(["https://a.com/x", "https://b.com/y", "https://c.com/z"]);
	});

	it("does not double-report the url inside a markdown link", () => {
		expect(findUrlSpans("[x](https://a.com) https://b.com")).toHaveLength(2);
	});

	it("ignores wikilinks and non-http schemes", () => {
		expect(findUrlSpans("[[Note]] and [mail](mailto:a@b.c) and obsidian://open")).toHaveLength(0);
	});
});

describe("trimTrailingPunctuation", () => {
	it("keeps a balanced closing paren", () => {
		expect(trimTrailingPunctuation("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
		expect(trimTrailingPunctuation("https://a.com/x).")).toBe("https://a.com/x");
	});
});
