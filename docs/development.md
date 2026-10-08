# Development notes

Internals and the build/release loop. User-facing docs are in the [README](../README.md).

## How hover resolution works

A document-level `mouseover` listener (one per window, pop-outs included) resolves the URL under the pointer:

1. **Rendered Markdown** (Reading view, Canvas text nodes), **Properties** and **Bases** — the hovered `<a>` (or Obsidian's `.external-link[data-href]` div) carries the URL.
2. **Editor** (Live Preview / Source) — the pointer is mapped to a document offset and that line's *source* is scanned for
   `[text](url)`, `<url>` and bare URLs. Working from the source rather than the DOM is what makes folded Live Preview links work.
3. **Canvas link nodes** — the node element is matched back to the canvas node object, which holds the URL.
4. **Plain text** (search results, backlinks pane, other sidebars) — the pointer is mapped to a caret position and the surrounding block's text is scanned for a URL. Code spans and editable fields are skipped.

A `mousemove` listener (active only while a link is armed or a card is open) tracks which link the pointer is on inside an editor line and enforces the stillness rule. After the hover delay the card opens (instantly from cache when possible) and stays open while the pointer is over the link or the card. `Esc`, clicking elsewhere or scrolling dismisses it, unless it is pinned.

## Error states

The card says why and offers a way out: *This site blocks previews* (401/403/429/503 or a bot-challenge page such as Cloudflare's or WeChat's), *Page not found*, *The site did not respond in time*, *Could not reach the site*, or *This page has no preview metadata*. Every error card has **Open in browser**; transient failures also get **Retry**, which bypasses the one-hour failure cache. Zhihu and other sites that refuse non-browser clients cannot be previewed; that is a limitation of fetching from the link's host directly rather than through a scraping service.

## Building

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
