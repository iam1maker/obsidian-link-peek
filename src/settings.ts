import { App, Notice, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type LinkPeekPlugin from "./main";

export interface LinkPeekSettings {
	enabled: boolean;
	/** Delay before a popover opens, so sweeping the mouse across text does not flash cards. */
	hoverDelayMs: number;
	cacheTtlDays: number;
	maxCacheEntries: number;
	showImages: boolean;
	/** Hostnames (suffix match) that never get a preview, e.g. internal tools or paywalls. */
	excludedDomains: string[];
	/** Also preview Canvas link nodes and links inside Canvas text nodes. */
	enableCanvas: boolean;
}

export const DEFAULT_SETTINGS: LinkPeekSettings = {
	enabled: true,
	hoverDelayMs: 350,
	cacheTtlDays: 7,
	maxCacheEntries: 2000,
	showImages: true,
	excludedDomains: [],
	enableCanvas: true,
};

export const FAILURE_TTL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CACHE_ENTRIES = 10;

export function ttlMsFromDays(days: number): number {
	return Math.max(1, days) * DAY_MS;
}

export function isExcluded(url: string, excludedDomains: string[]): boolean {
	if (excludedDomains.length === 0) return false;
	let host: string;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	return excludedDomains.some((domain) => {
		const d = domain.trim().toLowerCase();
		return d.length > 0 && (host === d || host.endsWith(`.${d}`));
	});
}

export function parseDomainList(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

type SettingKey = keyof LinkPeekSettings;

/**
 * Declarative settings (Obsidian ≥ 1.13): the definitions double as the
 * search index, so every option is reachable from the settings search box.
 * Values are read from and written to `plugin.settings` through the two
 * overrides below, because our data.json also carries the metadata cache.
 */
export class LinkPeekSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LinkPeekPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{
				name: "Enable hover previews",
				desc: "Turn previews off without disabling the plugin (the cache is kept).",
				control: { type: "toggle", key: "enabled", defaultValue: DEFAULT_SETTINGS.enabled },
			},
			{
				name: "Hover delay",
				desc: "How long the pointer must rest on a link before the card opens.",
				control: {
					type: "slider",
					key: "hoverDelayMs",
					min: 0,
					max: 1500,
					step: 50,
					defaultValue: DEFAULT_SETTINGS.hoverDelayMs,
					displayFormat: (value) => `${value} ms`,
				},
			},
			{
				name: "Show images",
				desc: "Render the og:image thumbnail in the card.",
				control: { type: "toggle", key: "showImages", defaultValue: DEFAULT_SETTINGS.showImages },
			},
			{
				name: "Preview in Canvas",
				desc: "Also show cards for Canvas link nodes and links inside Canvas text nodes.",
				control: { type: "toggle", key: "enableCanvas", defaultValue: DEFAULT_SETTINGS.enableCanvas },
			},
			{
				name: "Excluded domains",
				desc: "One hostname per line. Subdomains are included (example.com also excludes docs.example.com).",
				aliases: ["blocklist", "ignore sites"],
				control: { type: "textarea", key: "excludedDomains", placeholder: "example.com\nintranet.local", rows: 4 },
			},
			{
				type: "group",
				heading: "Cache",
				items: [
					{
						name: "Cache lifetime",
						desc: "Successful lookups are reused for this long. Failures are retried after an hour regardless.",
						control: {
							type: "slider",
							key: "cacheTtlDays",
							min: 1,
							max: 90,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.cacheTtlDays,
							displayFormat: (value) => `${value} day${value === 1 ? "" : "s"}`,
						},
					},
					{
						name: "Maximum cached links",
						desc: "Least recently used entries are dropped beyond this.",
						control: {
							type: "number",
							key: "maxCacheEntries",
							min: MIN_CACHE_ENTRIES,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.maxCacheEntries,
							validate: (value) =>
								Number.isInteger(value) && value >= MIN_CACHE_ENTRIES ? undefined : `Enter a whole number of at least ${MIN_CACHE_ENTRIES}.`,
						},
					},
					{
						name: "Clear cache",
						desc: `${this.plugin.cache.size} link(s) cached.`,
						action: () => {
							this.plugin.cache.clear();
							void this.plugin.saveSettings();
							new Notice("Link Peek: cache cleared");
							this.update();
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		const value = this.plugin.settings[key as SettingKey];
		return key === "excludedDomains" && Array.isArray(value) ? value.join("\n") : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		if (key === "excludedDomains") {
			settings[key] = parseDomainList(String(value ?? ""));
		} else if (key === "maxCacheEntries") {
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed < MIN_CACHE_ENTRIES) return;
			settings[key] = parsed;
		} else {
			settings[key] = value;
		}
		await this.plugin.saveSettings();
	}
}
