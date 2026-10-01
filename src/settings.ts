import { App, Notice, PluginSettingTab, Setting } from "obsidian";
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

export class LinkPeekSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: LinkPeekPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Enable hover previews")
			.setDesc("Turn previews off without disabling the plugin (the cache is kept).")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Hover delay")
			.setDesc("Milliseconds the pointer must rest on a link before the card opens.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1500, 50)
					.setValue(this.plugin.settings.hoverDelayMs)
					.onChange(async (value) => {
						this.plugin.settings.hoverDelayMs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show images")
			.setDesc("Render the og:image thumbnail in the card.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showImages).onChange(async (value) => {
					this.plugin.settings.showImages = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Preview in Canvas")
			.setDesc("Also show cards for Canvas link nodes and links inside Canvas text nodes.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableCanvas).onChange(async (value) => {
					this.plugin.settings.enableCanvas = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Excluded domains")
			.setDesc("One hostname per line. Subdomains are included (example.com also excludes docs.example.com).")
			.addTextArea((text) =>
				text
					.setPlaceholder("example.com\nintranet.local")
					.setValue(this.plugin.settings.excludedDomains.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludedDomains = value
							.split(/\r?\n/)
							.map((line) => line.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Cache").setHeading();

		new Setting(containerEl)
			.setName("Cache lifetime (days)")
			.setDesc("Successful lookups are reused for this long. Failures are retried after an hour regardless.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 90, 1)
					.setValue(this.plugin.settings.cacheTtlDays)
					.onChange(async (value) => {
						this.plugin.settings.cacheTtlDays = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Maximum cached links")
			.setDesc("Least recently used entries are dropped beyond this.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.maxCacheEntries)).onChange(async (value) => {
					const parsed = parseInt(value, 10);
					if (!Number.isFinite(parsed) || parsed < 10) return;
					this.plugin.settings.maxCacheEntries = parsed;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Clear cache")
			.setDesc(`${this.plugin.cache.size} link(s) cached.`)
			.addButton((button) =>
				button.setButtonText("Clear").onClick(async () => {
					this.plugin.cache.clear();
					await this.plugin.saveSettings();
					new Notice("Link Peek: cache cleared");
					this.display();
				}),
			);
	}
}
