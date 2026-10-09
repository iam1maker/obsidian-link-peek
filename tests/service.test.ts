import { describe, expect, it } from "vitest";
import { MetadataCache } from "../src/cache";
import { MetadataService } from "../src/metadata/service";
import type { MetadataResult } from "../src/metadata/types";

const ok = (title: string): MetadataResult => ({
	ok: true,
	meta: { url: "https://a.com", title, description: null, image: null, favicon: null, siteName: null, contentType: "text/html" },
});
const fail: MetadataResult = { ok: false, error: "HTTP 500", kind: "http" };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function setup(responses: MetadataResult[]) {
	let now = 1_000_000;
	const clock = () => now;
	const cache = new MetadataCache({ ttlMs: 7 * DAY, failureTtlMs: HOUR, maxEntries: 100 }, clock);
	let calls = 0;
	const service = new MetadataService(cache, () => Promise.resolve(responses[Math.min(calls++, responses.length - 1)]), clock);
	return { service, advance: (ms: number) => (now += ms), calls: () => calls };
}

describe("MetadataService.revalidate", () => {
	it("leaves fresh entries alone", async () => {
		const { service, calls } = setup([ok("v1")]);
		await service.lookup("https://a.com");
		expect(await service.revalidate("https://a.com")).toBeNull();
		expect(calls()).toBe(1);
	});

	it("refreshes a stale entry and replaces it", async () => {
		const { service, advance } = setup([ok("v1"), ok("v2")]);
		await service.lookup("https://a.com");
		advance(8 * DAY);
		expect(service.peek("https://a.com")?.title).toBe("v1");
		const fresh = await service.revalidate("https://a.com");
		expect(fresh?.ok && fresh.meta.title).toBe("v2");
		expect(service.peek("https://a.com")?.title).toBe("v2");
	});

	it("keeps the old metadata when the refresh fails, and waits before trying again", async () => {
		const { service, advance, calls } = setup([ok("v1"), fail, ok("v3")]);
		await service.lookup("https://a.com");
		advance(8 * DAY);
		await service.revalidate("https://a.com");
		expect(service.peek("https://a.com")?.title).toBe("v1");
		expect(await service.revalidate("https://a.com")).toBeNull();
		expect(calls()).toBe(2);
		advance(HOUR + 1);
		await service.revalidate("https://a.com");
		expect(service.peek("https://a.com")?.title).toBe("v3");
	});
});
