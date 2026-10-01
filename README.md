# Link Peek

Hover any external link in Obsidian and peek at it: an OpenGraph preview card with title, description, image, favicon and site name.
Inspired by [logseq-plugin-link-preview](https://github.com/pengx17/logseq-plugin-link-preview).

- Works in **Live Preview**, **Source mode**, **Reading view** and **Canvas** (link nodes and links inside text nodes).
- Fetches metadata through Obsidian's own `requestUrl` — no third-party preview service, no API keys, no CORS trouble.
- **Caches locally** (`data.json`) with a configurable lifetime and size; failed lookups are retried after an hour.
- **Never modifies your notes** — the card is pure rendering.
- Follows your theme (light/dark) via Obsidian CSS variables.

## Install

**Community plugins** (once accepted): Settings → Community plugins → Browse → "Link Peek".

**BRAT** (now): install [BRAT](https://github.com/TfTHacker/obsidian42-brat), then *Add a beta plugin* with `iam1maker/obsidian-link-peek`.

**Manual**: download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/iam1maker/obsidian-link-peek/releases/latest) into `<vault>/.obsidian/plugins/link-peek/` and enable the plugin.

## Network use and privacy

When you hover an external link, Link Peek sends a single GET request **to that link's host** to read its `<head>` metadata, with a desktop-browser User-Agent. Nothing is sent anywhere else: there is no telemetry and no intermediary service. Thumbnails and favicons are loaded by the card directly from the site (with `referrerpolicy="no-referrer"`). Use **Excluded domains** in settings to opt specific hosts out, or turn previews off entirely with the *Toggle hover previews* command.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Enable hover previews | on | Turn off without disabling the plugin; the cache is kept |
| Hover delay | 350 ms | Pointer must rest on a link this long before the card opens |
| Show images | on | Render the `og:image` thumbnail |
| Preview in Canvas | on | Cards for Canvas link nodes and links inside text nodes |
| Excluded domains | — | One hostname per line; subdomains are included |
| Cache lifetime | 7 days | Failures are retried after an hour regardless |
| Maximum cached links | 2000 | Least recently used entries are dropped beyond this |

Commands: **Toggle hover previews**, **Clear metadata cache**.

## How it works

A single document-level `mouseover` listener resolves the URL under the pointer:

1. **Rendered Markdown** (Reading view, Canvas text nodes) — the hovered `<a>` carries the href.
2. **Editor** (Live Preview / Source) — the pointer is mapped to a document offset and that line's *source* is scanned for
   `[text](url)`, `<url>` and bare URLs. Working from the source rather than the DOM is what makes folded Live Preview links work.
3. **Canvas link nodes** — the node element is matched back to the canvas node object, which holds the URL.

After the hover delay the card opens (instantly from cache when possible) and stays open while the pointer is over the link or the card. `Esc`, clicking elsewhere or scrolling dismisses it.

## Development

```bash
npm install
npm run dev        # esbuild watch → main.js
npm test           # vitest: metadata parsing, cache, editor URL resolution
npm run build      # type-check + minified bundle
```

Link the checkout into a vault to test it live:

```bash
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/link-peek
```

Releases are cut by pushing a tag equal to the `manifest.json` version (`npm version patch && git push --follow-tags`); GitHub Actions builds and attaches `main.js`, `manifest.json`, `styles.css`.

## License

[MIT](LICENSE)
