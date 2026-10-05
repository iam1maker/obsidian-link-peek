import { App, Notice, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type LinkPeekPlugin from "./main";

/**
 * Inline titles for bare URLs:
 * - off: no decoration
 * - cached: only links whose metadata is already cached (no extra requests)
 * - fetch: also fetch metadata for links on screen
 */
export type InlineTitlesMode = "off" | "cached" | "fetch";

/** Which key must be held for a hover to open a card. "none" means plain hover. */
export type TriggerModifier = "none" | "Mod" | "Alt" | "Shift";

export interface LinkPeekSettings {
	enabled: boolean;
	/** Delay before a popover opens, so sweeping the mouse across text does not flash cards. */
	hoverDelayMs: number;
	triggerModifier: TriggerModifier;
	/** Restart the hover delay whenever the pointer moves, so only a resting pointer opens a card. */
	requireStillPointer: boolean;
	cacheTtlDays: number;
	maxCacheEntries: number;
	showImages: boolean;
	/** Hostnames (suffix match) that never get a preview, e.g. internal tools or paywalls. */
	excludedDomains: string[];
	/** Also preview Canvas link nodes and links inside Canvas text nodes. */
	enableCanvas: boolean;
	/** Hostnames (suffix match) whose thumbnails are never shown, e.g. image-heavy or NSFW hosts. */
	noImageDomains: string[];
	/** How many lines of description the card shows before clamping. */
	descriptionLines: number;
	/** Compact cards: favicon, site and title only. */
	compactCards: boolean;
	inlineTitles: InlineTitlesMode;
	/** The mode the toggle command restores when turning inline titles back on. */
	inlineLastMode: Exclude<InlineTitlesMode, "off">;
	/** Favicon in front of `[text](url)` links. */
	inlineFavicons: boolean;
	/** Inline titles longer than this are cut with an ellipsis. */
	inlineMaxTitle: number;
}

export const DEFAULT_SETTINGS: LinkPeekSettings = {
	enabled: true,
	hoverDelayMs: 350,
	triggerModifier: "none",
	requireStillPointer: true,
	cacheTtlDays: 7,
	maxCacheEntries: 2000,
	showImages: true,
	excludedDomains: [],
	enableCanvas: true,
	noImageDomains: [],
	descriptionLines: 3,
	compactCards: false,
	inlineTitles: "off",
	inlineLastMode: "cached",
	inlineFavicons: false,
	inlineMaxTitle: 60,
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
				name: "Trigger key",
				desc: "Only open cards while this key is held. Pressing it while already hovering a link opens the card too.",
				aliases: ["modifier", "hold key"],
				control: {
					type: "dropdown",
					key: "triggerModifier",
					defaultValue: DEFAULT_SETTINGS.triggerModifier,
					options: {
						none: "None (plain hover)",
						Mod: "Cmd (macOS) / Ctrl",
						Alt: "Option / Alt",
						Shift: "Shift",
					},
				},
			},
			{
				name: "Only when the pointer is still",
				desc: "Restart the hover delay whenever the pointer moves, so sweeping across text never opens cards.",
				aliases: ["stillness"],
				control: { type: "toggle", key: "requireStillPointer", defaultValue: DEFAULT_SETTINGS.requireStillPointer },
			},
			{
				type: "group",
				heading: "Card",
				items: [
					{
						name: "Show images",
						desc: "Render the og:image thumbnail in the card.",
						control: { type: "toggle", key: "showImages", defaultValue: DEFAULT_SETTINGS.showImages },
					},
					{
						name: "Hide images from these domains",
						desc: "One hostname per line; subdomains are included. Cards from these sites show no thumbnail.",
						aliases: ["no image", "thumbnail blocklist"],
						control: { type: "textarea", key: "noImageDomains", placeholder: "example.com", rows: 3 },
					},
					{
						name: "Description lines",
						desc: "How many lines of description to show before cutting off.",
						control: {
							type: "slider",
							key: "descriptionLines",
							min: 1,
							max: 6,
							step: 1,
							defaultValue: DEFAULT_SETTINGS.descriptionLines,
							displayFormat: (value) => `${value} line${value === 1 ? "" : "s"}`,
						},
					},
					{
						name: "Compact cards",
						desc: "Show only favicon, site name and title. No image, no description.",
						control: { type: "toggle", key: "compactCards", defaultValue: DEFAULT_SETTINGS.compactCards },
					},
				],
			},
			{
				type: "group",
				heading: "Inline links",
				items: [
					{
						name: "Inline link titles",
						desc: "Show bare URLs as favicon + page title in Live Preview and Reading view. The note itself is not changed; put the cursor on the link to see the URL. \"Fetch\" sends a request to each site whose link is on screen.",
						aliases: ["chip", "decorate", "rich link"],
						control: {
							type: "dropdown",
							key: "inlineTitles",
							defaultValue: DEFAULT_SETTINGS.inlineTitles,
							options: {
								off: "Off",
								cached: "Only links already previewed (no extra requests)",
								fetch: "Fetch titles for links on screen",
							},
						},
					},
					{
						name: "Favicons on text links",
						desc: "Show the site icon in front of [text](url) links. The link text stays as you wrote it.",
						control: { type: "toggle", key: "inlineFavicons", defaultValue: DEFAULT_SETTINGS.inlineFavicons },
					},
					{
						name: "Maximum title length",
						desc: "Longer titles are cut with an ellipsis.",
						control: {
							type: "slider",
							key: "inlineMaxTitle",
							min: 20,
							max: 120,
							step: 5,
							defaultValue: DEFAULT_SETTINGS.inlineMaxTitle,
							displayFormat: (value) => `${value} characters`,
						},
					},
				],
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
							this.plugin.service.clear();
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
		return (key === "excludedDomains" || key === "noImageDomains") && Array.isArray(value) ? value.join("\n") : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		if (key === "excludedDomains" || key === "noImageDomains") {
			settings[key] = parseDomainList(String(value ?? ""));
		} else if (key === "maxCacheEntries") {
			const parsed = Number(value);
			if (!Number.isInteger(parsed) || parsed < MIN_CACHE_ENTRIES) return;
			settings[key] = parsed;
		} else {
			settings[key] = value;
			if (key === "inlineTitles" && value !== "off") settings.inlineLastMode = value;
		}
		await this.plugin.saveSettings();
	}
}
