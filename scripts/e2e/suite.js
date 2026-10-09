// Link Peek end-to-end suite. Runs inside a live Obsidian window: scripts/e2e/run.mjs
// has Obsidian read and evaluate this file, then polls `window.__lpkE2E` for the report.
//
// Safe for a real vault: fixture notes live under a temporary name and are deleted
// afterwards, links use the reserved `.test` TLD and are seeded straight into the
// cache (no network), and the user's settings are restored at the end.
(async () => {
	const FOLDER = window.__lpkE2EFolder ?? "";
	const state = { done: false, results: [], error: null };
	window.__lpkE2E = state;

	const plugin = app.plugins.plugins["link-peek"];
	if (!plugin) {
		state.error = "Link Peek is not enabled in this vault";
		state.done = true;
		return;
	}

	const BASE = "https://lpk-e2e.test";
	const PAGES = { alpha: "Alpha page", beta: "Beta page", gamma: "Gamma page", delta: "Delta page" };
	const url = (slug) => `${BASE}/${slug}`;
	const PDF = `${BASE}/files/report.pdf`;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const prefix = FOLDER ? `${FOLDER.replace(/\/$/, "")}/` : "";
	const paths = { main: `${prefix}Link Peek e2e fixture.md`, optOut: `${prefix}Link Peek e2e opt-out.md` };

	const FIXTURE = [
		`bare: ${url("alpha")}`,
		"",
		"list:",
		`- ${url("beta")}`,
		"",
		"> [!note]",
		`> ${url("gamma")}`,
		"",
		`text: [Delta text](${url("delta")})`,
		"",
		`code: \`${url("alpha")}\``,
		"",
		`comment: %% ${url("alpha")} %%`,
		"",
		`uncached: ${url("uncached")}`,
		"",
		`file: ${PDF}`,
		"",
		"end",
	].join("\n");
	const OPT_OUT = ["---", "link-peek: off", "---", "", `bare: ${url("alpha")}`, ""].join("\n");

	const assert = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const sameSet = (actual, expected, what) =>
		assert(
			JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
			`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	const waitFor = async (check, what, timeoutMs = 3000) => {
		const start = performance.now();
		for (;;) {
			const value = check();
			if (value) return value;
			if (performance.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
			await sleep(50);
		}
	};

	// Editor widgets are `.lpk-chip`; rendered blocks inside the editor (callouts, tables) are anchors.
	const chipsIn = (root) => [...root.querySelectorAll(".cm-content .lpk-chip, .cm-content a.lpk-chip-anchor")];
	const hrefOf = (el) => el.dataset.href ?? el.getAttribute("href");
	const chipTitles = (root) => chipsIn(root).map((chip) => chip.textContent);
	const visibleCard = (doc) => [...doc.querySelectorAll(".lpk-popover")].find((el) => el.isShown());

	async function openNote(path, leaf = app.workspace.getLeaf("tab")) {
		await leaf.openFile(app.vault.getFileByPath(path));
		// Background tabs hold a deferred placeholder view until they are shown.
		await app.workspace.revealLeaf(leaf);
		await leaf.loadIfDeferred?.();
		await waitFor(() => leaf.view?.editor, "the editor to load");
		await setMode(leaf, "live");
		return leaf;
	}
	async function show(leaf) {
		await app.workspace.revealLeaf(leaf);
		app.workspace.setActiveLeaf(leaf, { focus: false });
		await sleep(200);
	}
	async function setMode(leaf, mode) {
		const current = leaf.view.getState();
		const next =
			mode === "reading" ? { mode: "preview" } : { mode: "source", source: mode === "source" };
		await leaf.view.setState({ ...current, ...next }, { history: false });
		await sleep(400);
	}

	// ---- setup -----------------------------------------------------------------
	const remote = require("@electron/remote");
	const webContents = remote.getCurrentWebContents();
	webContents.setBackgroundThrottling(false);
	const savedSettings = { ...plugin.settings };
	const leaves = [];
	const seeded = [...Object.keys(PAGES).map(url), PDF];

	try {
		for (const [slug, title] of Object.entries(PAGES)) {
			plugin.cache.set(url(slug), {
				ok: true,
				meta: { url: url(slug), title, description: `${title} description`, image: null, favicon: null, siteName: "lpk-e2e.test", contentType: "text/html" },
			});
		}
		Object.assign(plugin.settings, {
			enabled: true,
			hoverDelayMs: 100,
			triggerModifier: "none",
			requireStillPointer: true,
			inlineTitles: "cached",
			inlineFavicons: false,
			compactCards: false,
		});
		await plugin.saveSettings();

		for (const [key, content] of [["main", FIXTURE], ["optOut", OPT_OUT]]) {
			const existing = app.vault.getFileByPath(paths[key]);
			if (existing) await app.vault.modify(existing, content);
			else await app.vault.create(paths[key], content);
		}
		await sleep(300);

		const tests = [];
		const test = (name, fn) => tests.push({ name, fn });

		// ---- tests -----------------------------------------------------------------
		test("Live Preview shows titles for cached bare URLs only", async () => {
			const leaf = await openNote(paths.main);
			leaves.push(leaf);
			leaf.view.editor.setCursor({ line: FIXTURE.split("\n").length - 1, ch: 0 });
			const titles = await waitFor(() => {
				const found = chipTitles(leaf.view.containerEl);
				return found.length >= 3 && found;
			}, "three chips");
			sameSet(titles, [PAGES.alpha, PAGES.beta, PAGES.gamma], "chip titles");
		});

		test("caret on a URL brings the raw URL back", async () => {
			const leaf = leaves[0];
			await show(leaf);
			const editor = leaf.view.editor;
			editor.setCursor({ line: 0, ch: 10 });
			await waitFor(() => !chipsIn(leaf.view.containerEl).some((c) => hrefOf(c) === url("alpha")), "alpha to reveal");
			editor.setCursor({ line: FIXTURE.split("\n").length - 1, ch: 0 });
			await waitFor(() => chipsIn(leaf.view.containerEl).some((c) => hrefOf(c) === url("alpha")), "alpha chip to return");
		});

		test("Source mode shows raw Markdown", async () => {
			const leaf = leaves[0];
			await show(leaf);
			await setMode(leaf, "source");
			assert(chipsIn(leaf.view.containerEl).length === 0, "chips found in Source mode");
			await setMode(leaf, "live");
		});

		test("Reading view shows titles and keeps link text", async () => {
			const leaf = leaves[0];
			await show(leaf);
			await setMode(leaf, "reading");
			const view = leaf.view.containerEl.querySelector(".markdown-reading-view");
			const anchors = await waitFor(() => {
				const found = [...view.querySelectorAll("a.lpk-chip-anchor")];
				return found.length >= 3 && found;
			}, "three reading-view chips");
			sameSet(anchors.map((a) => a.textContent), [PAGES.alpha, PAGES.beta, PAGES.gamma], "reading titles");
			const delta = [...view.querySelectorAll("a.external-link")].find((a) => a.getAttribute("href") === url("delta"));
			assert(delta && delta.textContent === "Delta text", "text link lost its text");
			await setMode(leaf, "live");
		});

		test("link-peek: off in properties turns titles off for that note", async () => {
			const leaf = await openNote(paths.optOut);
			leaves.push(leaf);
			await sleep(600);
			assert(chipsIn(leaf.view.containerEl).length === 0, "chips found in an opted-out note");
		});

		test("turning inline titles off restores every URL", async () => {
			const leaf = leaves[0];
			await show(leaf);
			plugin.settings.inlineTitles = "off";
			await plugin.saveSettings();
			await waitFor(() => chipsIn(leaf.view.containerEl).length === 0, "chips to disappear");
			plugin.settings.inlineTitles = "cached";
			await plugin.saveSettings();
			await waitFor(() => chipsIn(leaf.view.containerEl).length >= 3, "chips to come back");
		});

		test("hovering a title opens the card, Escape closes it", async () => {
			const leaf = leaves[0];
			await show(leaf);
			const chip = chipsIn(leaf.view.containerEl).find((c) => hrefOf(c) === url("alpha"));
			const rect = chip.getBoundingClientRect();
			const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true };
			chip.dispatchEvent(new MouseEvent("mouseover", at));
			chip.dispatchEvent(new MouseEvent("mousemove", at));
			const card = await waitFor(() => visibleCard(document), "card to open");
			assert(card.querySelector(".lpk-title")?.textContent === PAGES.alpha, "card shows the wrong title");
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await waitFor(() => !visibleCard(document), "card to close");
		});

		test("file links are named, not downloaded", async () => {
			const start = performance.now();
			const result = await plugin.service.lookup(PDF);
			const elapsed = performance.now() - start;
			assert(result.ok && result.meta.fileKind === "pdf", `expected a pdf file result, got ${JSON.stringify(result)}`);
			assert(result.meta.title === "report.pdf", `title was ${result.meta.title}`);
			assert(elapsed < 50, `lookup took ${Math.round(elapsed)} ms, as if it downloaded`);
			const leaf = leaves[0];
			await show(leaf);
			const chip = await waitFor(() => chipsIn(leaf.view.containerEl).find((c) => hrefOf(c) === PDF), "file chip");
			plugin.debug.hover.previewElement(PDF, chip);
			const card = await waitFor(() => visibleCard(document), "file card");
			assert(card.querySelector(".lpk-file"), "file card has no file row");
			card.querySelector(".lpk-close")?.click();
			await waitFor(() => !visibleCard(document), "file card to close");
		});

		test("pop-out windows render titles in their own document", async () => {
			const leaf = app.workspace.openPopoutLeaf({ size: { width: 700, height: 600 } });
			leaves.push(leaf);
			await openNote(paths.main, leaf);
			const doc = leaf.view.containerEl.ownerDocument;
			assert(doc !== document, "leaf did not open in a pop-out");
			const chips = await waitFor(() => {
				const found = chipsIn(leaf.view.containerEl);
				return found.length >= 3 && found;
			}, "chips in the pop-out");
			assert(chips.every((c) => c.ownerDocument === doc), "chip created in the wrong document");
		});

		// ---- run -------------------------------------------------------------------
		for (const { name, fn } of tests) {
			const start = performance.now();
			try {
				await fn();
				state.results.push({ name, ok: true, ms: Math.round(performance.now() - start) });
			} catch (error) {
				state.results.push({ name, ok: false, ms: Math.round(performance.now() - start), error: String(error?.message ?? error) });
			}
		}
	} catch (error) {
		state.error = String(error?.stack ?? error);
	} finally {
		// ---- cleanup ---------------------------------------------------------------
		for (const leaf of leaves.reverse()) leaf.detach();
		for (const path of Object.values(paths)) {
			const file = app.vault.getFileByPath(path);
			if (file) await app.vault.delete(file);
		}
		for (const link of seeded) plugin.cache.delete(link);
		Object.assign(plugin.settings, savedSettings);
		await plugin.saveSettings();
		webContents.setBackgroundThrottling(true);
		state.done = true;
	}
})();
