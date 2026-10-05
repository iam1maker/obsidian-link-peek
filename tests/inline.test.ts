import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyNode, isBareAnchor, markdownLinkStart, optedOut, touches } from "../src/inline/classify";
import { chipLabel, clampText } from "../src/inline/label";
import { Prefetcher } from "../src/inline/prefetch";
import type { LinkMetadata } from "../src/metadata/types";

describe("classifyNode", () => {
	// Node names as Obsidian 1.13 produces them (dumped from a real editor).
	it("recognises bare URLs in prose, lists, quotes and tables", () => {
		expect(classifyNode("url")).toBe("bare");
		expect(classifyNode("list-1_url")).toBe("bare");
		expect(classifyNode("quote_quote-1_url")).toBe("bare");
	});

	it("tells autolinks and link targets apart", () => {
		expect(classifyNode("formatting_formatting-link_link_url")).toBe("autolink");
		expect(classifyNode("string_url")).toBe("target");
	});

	it("ignores code, comments and the link punctuation", () => {
		expect(classifyNode("inline-code")).toBeNull();
		expect(classifyNode("hmd-codeblock")).toBeNull();
		expect(classifyNode("comment_url")).toBeNull();
		// The parentheses around a link target are tagged `url` as well.
		expect(classifyNode("formatting_formatting-link-string_string_url")).toBeNull();
		expect(classifyNode("link")).toBeNull();
	});
});

describe("markdownLinkStart", () => {
	it("finds the opening bracket and flags images", () => {
		const line = "text link: [Link Peek 仓库](https://github.com/x)";
		const urlFrom = line.indexOf("https");
		expect(markdownLinkStart(line, urlFrom)).toEqual({ start: line.indexOf("["), isImage: false });
		const img = "image: ![alt](https://a.com/i.png)";
		expect(markdownLinkStart(img, img.indexOf("https"))).toEqual({ start: img.indexOf("["), isImage: true });
	});

	it("walks over nested brackets and rejects odd shapes", () => {
		const line = "[a [b] c](https://x.com)";
		expect(markdownLinkStart(line, line.indexOf("https"))?.start).toBe(0);
		expect(markdownLinkStart("(https://x.com)", 1)).toBeNull();
	});
});

describe("optedOut / touches / isBareAnchor", () => {
	it("reads the per-note switch", () => {
		expect(optedOut("off")).toBe(true);
		expect(optedOut(false)).toBe(true);
		expect(optedOut("Off ")).toBe(true);
		expect(optedOut("on")).toBe(false);
		expect(optedOut(undefined)).toBe(false);
	});

	it("treats a caret at either edge as touching", () => {
		expect(touches(10, 10, 10, 20)).toBe(true);
		expect(touches(20, 20, 10, 20)).toBe(true);
		expect(touches(21, 25, 10, 20)).toBe(false);
		expect(touches(0, 9, 10, 20)).toBe(false);
	});

	it("spots anchors whose text is their own URL, encoded or not", () => {
		expect(isBareAnchor("https://a.com/x", "https://a.com/x")).toBe(true);
		expect(isBareAnchor("https://zh.wikipedia.org/wiki/小白", "https://zh.wikipedia.org/wiki/%E5%B0%8F%E7%99%BD")).toBe(true);
		expect(isBareAnchor("Link Peek", "https://a.com/x")).toBe(false);
		expect(isBareAnchor("mailto:a@b.c", "mailto:a@b.c")).toBe(false);
	});
});

describe("chip label", () => {
	const meta = (title: string | null): LinkMetadata => ({
		url: "https://a.com",
		title,
		description: null,
		image: null,
		favicon: "https://a.com/favicon.ico",
		siteName: null,
		contentType: "text/html",
	});

	it("clamps by code points and never splits a character", () => {
		expect(clampText("abcdef", 10)).toBe("abcdef");
		expect(clampText("abcdef", 4)).toBe("abc…");
		expect(clampText("维基百科自由的百科全书", 5)).toBe("维基百科…");
		expect(clampText("😀😀😀😀", 3)).toBe("😀😀…");
	});

	it("only makes a chip from a real title", () => {
		expect(chipLabel(meta("  GitHub   repo ")!, 60)).toEqual({ title: "GitHub repo", favicon: "https://a.com/favicon.ico" });
		expect(chipLabel(meta(null), 60)).toBeNull();
		expect(chipLabel(meta("   "), 60)).toBeNull();
		expect(chipLabel(null, 60)).toBeNull();
	});
});

describe("Prefetcher", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const make = (known = new Set<string>()) => {
		const started: string[] = [];
		const resolvers = new Map<string, () => void>();
		const prefetcher = new Prefetcher({
			lookup: (url) =>
				new Promise<void>((resolve) => {
					started.push(url);
					resolvers.set(url, () => {
						known.add(url);
						resolve();
					});
				}),
			known: (url) => known.has(url),
			delayMs: 500,
			concurrency: 2,
			setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
			clearTimer: (id) => clearTimeout(id),
		});
		return { prefetcher, started, resolvers, known };
	};

	it("waits until the view has been still, then runs two at a time", async () => {
		const { prefetcher, started, resolvers } = make();
		prefetcher.enqueue(["a", "b", "c"]);
		vi.advanceTimersByTime(400);
		prefetcher.enqueue(["d"]); // scrolling: restarts the wait
		vi.advanceTimersByTime(400);
		expect(started).toEqual([]);
		vi.advanceTimersByTime(100);
		expect(started).toEqual(["a", "b"]);
		resolvers.get("a")!();
		await vi.runAllTimersAsync();
		expect(started).toEqual(["a", "b", "c"]);
	});

	it("skips URLs the cache already knows and duplicates", () => {
		const { prefetcher, started } = make(new Set(["known"]));
		prefetcher.enqueue(["known", "x", "x"]);
		expect(prefetcher.pending).toBe(1);
		vi.advanceTimersByTime(500);
		expect(started).toEqual(["x"]);
	});

	it("clear() drops what has not started", () => {
		const { prefetcher, started } = make();
		prefetcher.enqueue(["a"]);
		prefetcher.clear();
		vi.advanceTimersByTime(1000);
		expect(started).toEqual([]);
	});
});
