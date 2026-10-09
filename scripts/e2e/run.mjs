#!/usr/bin/env node
// Runs scripts/e2e/suite.js inside a running Obsidian through the official CLI.
//
//   LPK_E2E_VAULT=<vault name> [LPK_E2E_FOLDER=<folder for fixtures>] npm run e2e
//
// Obsidian must be open on that vault with Link Peek enabled (a symlinked dev build).
// The plugin is reloaded first so the suite runs against the current main.js.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vault = process.env.LPK_E2E_VAULT;
if (!vault) {
	console.error("Set LPK_E2E_VAULT to the name of a vault where Link Peek is enabled.");
	process.exit(2);
}
const folder = process.env.LPK_E2E_FOLDER ?? "";
const EVAL_TIMEOUT_MS = 30_000;
const SUITE_TIMEOUT_MS = 120_000;
const POLL_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function obsidianEval(code) {
	let out;
	try {
		out = execFileSync("obsidian", [`vault=${vault}`, "eval", `code=${code}`], {
			encoding: "utf8",
			timeout: EVAL_TIMEOUT_MS,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		throw new Error(`obsidian eval failed (is Obsidian open on "${vault}"?): ${error.message}`);
	}
	const line = out.split("\n").find((l) => l.startsWith("=> "));
	if (line === undefined) throw new Error(`Unexpected CLI output:\n${out}`);
	return line.slice(3);
}

async function waitForGlobal(name, what) {
	const deadline = Date.now() + SUITE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await sleep(POLL_MS);
		const value = JSON.parse(obsidianEval(`JSON.stringify(window.${name} ?? null)`));
		if (value?.done) return value;
	}
	throw new Error(`Timed out waiting for ${what}`);
}

const reload = `(async () => {
	window.__lpkReload = { done: false };
	const p = app.plugins;
	await p.loadManifests();
	await p.disablePlugin("link-peek");
	await p.enablePlugin("link-peek");
	window.__lpkReload = { done: true, version: p.manifests["link-peek"]?.version };
})(); "reloading"`;
obsidianEval(reload);
const { version } = await waitForGlobal("__lpkReload", "the plugin to reload");
console.log(`Link Peek ${version} in vault "${vault}"\n`);

// The CLI drops long `code=` arguments, so Obsidian reads the suite from disk itself.
const suitePath = fileURLToPath(new URL("./suite.js", import.meta.url));
obsidianEval(
	`window.__lpkE2EFolder = ${JSON.stringify(folder)}; (0, eval)(require("fs").readFileSync(${JSON.stringify(suitePath)}, "utf8")); "started"`,
);
const report = await waitForGlobal("__lpkE2E", "the suite to finish");

for (const r of report.results) {
	console.log(`${r.ok ? "✓" : "✗"} ${r.name} (${r.ms} ms)${r.ok ? "" : `\n    ${r.error}`}`);
}
if (report.error) console.error(`\nSuite error: ${report.error}`);
const failed = report.results.filter((r) => !r.ok).length;
console.log(`\n${report.results.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 || report.error ? 1 : 0);
