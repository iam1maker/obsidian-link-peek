import { describe, expect, it } from "vitest";
import { isOwnParagraph, standaloneUrl } from "../src/cards/standalone";

describe("standaloneUrl", () => {
	it("accepts a bare URL or an autolink alone on the line", () => {
		expect(standaloneUrl("https://example.com/a")).toEqual({ url: "https://example.com/a", start: 0, end: 21 });
		expect(standaloneUrl("  https://example.com/a  ")?.start).toBe(2);
		expect(standaloneUrl("<https://example.com/a>")).toEqual({ url: "https://example.com/a", start: 1, end: 22 });
	});

	it("rejects anything else on the line", () => {
		expect(standaloneUrl("see https://example.com/a")).toBeNull();
		expect(standaloneUrl("- https://example.com/a")).toBeNull();
		expect(standaloneUrl("> https://example.com/a")).toBeNull();
		expect(standaloneUrl("| https://example.com/a |")).toBeNull();
		expect(standaloneUrl("[a](https://example.com/a)")).toBeNull();
		expect(standaloneUrl("<https://example.com/a")).toBeNull();
		expect(standaloneUrl("    https://example.com/a")).toBeNull();
		expect(standaloneUrl("ftp://example.com/a")).toBeNull();
		expect(standaloneUrl("")).toBeNull();
	});
});

describe("isOwnParagraph", () => {
	it("needs blank lines, headings or the document edge around it", () => {
		expect(isOwnParagraph(undefined, undefined)).toBe(true);
		expect(isOwnParagraph("", "")).toBe(true);
		expect(isOwnParagraph("## Links", "")).toBe(true);
		expect(isOwnParagraph("---", "# Next")).toBe(true);
	});

	it("is false when the URL continues a paragraph or a list", () => {
		expect(isOwnParagraph("Some text", "")).toBe(false);
		expect(isOwnParagraph("", "more text")).toBe(false);
		expect(isOwnParagraph("- item", "")).toBe(false);
	});
});
