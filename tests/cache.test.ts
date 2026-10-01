import { describe, expect, it } from "vitest";
import { MetadataCache, normalizeUrl } from "../src/cache";
import type { MetadataResult } from "../src/metadata/types";

const ok = (url: string): MetadataResult => ({
	ok: true,
	meta: { url, title: "t", description: null, image: null, favicon: null, siteName: null, contentType: "text/html" },
});
const fail: MetadataResult = { ok: false, error: "HTTP 500" };

function makeCache(overrides: Partial<{ ttlMs: number; failureTtlMs: number; maxEntries: number }> = {}) {
	let now = 1_000_000;
	const cache = new MetadataCache({ ttlMs: 1000, failureTtlMs: 100, maxEntries: 3, ...overrides }, () => now);
	return { cache, advance: (ms: number) => (now += ms) };
}

describe("normalizeUrl", () => {
	it("drops fragments and trims whitespace", () => {
		expect(normalizeUrl("  https://a.com/x#frag ")).toBe("https://a.com/x");
		expect(normalizeUrl("https://a.com/x?q=1")).toBe("https://a.com/x?q=1");
	});
});

describe("MetadataCache", () => {
	it("returns entries until the TTL elapses", () => {
		const { cache, advance } = makeCache();
		cache.set("https://a.com", ok("https://a.com"));
		advance(999);
		expect(cache.get("https://a.com#x")).toEqual(ok("https://a.com"));
		advance(2);
		expect(cache.get("https://a.com")).toBeNull();
	});

	it("expires failures on the shorter failure TTL", () => {
		const { cache, advance } = makeCache();
		cache.set("https://down.com", fail);
		advance(99);
		expect(cache.get("https://down.com")).toEqual(fail);
		advance(2);
		expect(cache.get("https://down.com")).toBeNull();
	});

	it("evicts least recently used entries beyond maxEntries", () => {
		const { cache, advance } = makeCache();
		for (const n of [1, 2, 3]) {
			cache.set(`https://a.com/${n}`, ok(`https://a.com/${n}`));
			advance(1);
		}
		cache.get("https://a.com/1"); // touch 1 so 2 becomes the oldest
		advance(1);
		cache.set("https://a.com/4", ok("https://a.com/4"));
		expect(cache.size).toBe(3);
		expect(cache.get("https://a.com/2")).toBeNull();
		expect(cache.get("https://a.com/1")).not.toBeNull();
	});

	it("round-trips through JSON, dropping expired and malformed entries", () => {
		const { cache, advance } = makeCache();
		cache.set("https://a.com/live", ok("https://a.com/live"));
		cache.set("https://a.com/dead", fail);
		advance(150);
		const json = JSON.parse(JSON.stringify(cache.toJSON())) as Record<string, unknown>;
		expect(Object.keys(json)).toEqual(["https://a.com/live"]);
		json["https://a.com/garbage"] = { nope: true };

		const { cache: restored } = makeCache();
		restored.fromJSON(json);
		expect(restored.size).toBe(1);
		expect(restored.get("https://a.com/live")).toEqual(ok("https://a.com/live"));
	});

	it("shrinks when maxEntries is lowered", () => {
		const { cache, advance } = makeCache({ maxEntries: 5 });
		for (const n of [1, 2, 3, 4, 5]) {
			cache.set(`https://a.com/${n}`, ok(`https://a.com/${n}`));
			advance(1);
		}
		cache.setOptions({ maxEntries: 2 });
		expect(cache.size).toBe(2);
		expect(cache.get("https://a.com/5")).not.toBeNull();
	});
});
