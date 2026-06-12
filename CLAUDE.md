# 19c-slides project notes

Local Quarto RevealJS slide app. `README.md` is the canonical, public-facing doc and is written generically for any user. Keep it that way. This file holds the private and environment-specific notes that do not belong in the public README.

## What this repo is for us

- This is Causal Map's own slide repo. The bundled decks include real talks (`Amsterdam-UMC`, `901-coding-workflow`) alongside the `welcome` walkthrough and the `demo-*` theme decks.
- **Steve usually names a deck by its title, not its folder name.** A deck's title is the `pagetitle:`, or the `.title-page` headline, in its `slides.qmd`, e.g. "How robust are your causal pathways?" for the `902-quality-assurance` folder. When he refers to a deck, match against titles, not just folder names, and confirm the folder if it is at all ambiguous.
- Our public decks are published at [slides.causalmap.app](https://slides.causalmap.app) (Netlify, read-only). The README describes publishing generically; that URL is ours, so keep it out of the README.

## Architecture

- Two processes in dev, one in production. `npm start` (from the repo root, forwarded into `app/`) builds the frontend and serves both the app and the API on **http://127.0.0.1:3210**. `npm run dev` additionally runs Vite with hot reload on **5173**, proxying `/api` and `/media` to 3210; only for editing the app's own code. `npm run serve` serves the last build without rebuilding.
- `.qmd` files are the source of truth. The app reads and writes them and embeds `quarto preview`. Slide identity is driven by the rendered deck via `_shared/preview-bridge.html`, not by re-parsing layout, so the rail, editor and preview stay in sync.
- A short-lived `quarto preview` web server runs per deck on a random port; the preview iframe loads it.

## Google Drive quirk (this clone)

This clone lives in Google Drive, which keeps writing `desktop.ini` files into every synced folder, including inside `.git/` (e.g. `.git/refs/`). Git reads those as refs and aborts with `bad object refs/desktop.ini`, breaking commits and pushes. The tracked `pre-commit` and `pre-push` hooks delete every `desktop.ini` under `.git/` before they run, so this self-heals once `core.hooksPath` is set. If git fails this way outside a hook, clear them by hand from Git Bash at the repo root:

```bash
find .git -iname desktop.ini -delete
```

## Publish workflow (ours)

- `git config core.hooksPath hooks` once per clone so the `pre-commit` hook runs `build-site.ps1` and stages `_site/` whenever a commit touches a `.qmd`, `_shared/`, or `build-site.ps1`. Needs `pwsh` on PATH.
- `_site/` is committed and served by Netlify; in-deck `slides.html` renders stay gitignored. `.gitattributes` marks `_site/` as generated so the inlined-base64 files diff as binary.
- Netlify config: build command empty, publish directory `_site`. Quarto output is deterministic, so unchanged decks add nothing to history.

## Conventions

- Title slides use a real `# {.title-page}` heading, never YAML `title:`/`subtitle:` (which would create an uneditable auto title slide). `.title-page` styling is in `_shared/styles.css` for a dark background. Section dividers can reuse the same look with `# Title {.center .no-title .title-page background-color="#1F1F36"}`, so the visible heading is hidden but the breadcrumb and overview still get the section name.
- Decks do not set `embed-resources`; embedding happens only at publish time via `build-site.ps1 --embed-resources`.
- **Navigation defaults to `linear` for every deck**, set once in `_quarto.yml`. Right, down and the spacebar all walk straight to the next slide, so a first-time presenter is never lost in a two-dimensional grid. Sections still group the overview and feed the breadcrumb; you can still build a 2D deck, the keys just stay linear. A deck overrides with `navigation-mode: vertical`/`grid` only on purpose. Do not re-add `navigation-mode: vertical` to a deck without a reason.
- **A first-slide "Press the spacebar to move on" hint** is injected by `_shared/preview-bridge.html` on the published or standalone deck only (it checks `window.parent === window`, so it never shows in the app's editing preview). It fades on first navigation. Every deck that includes the shared header gets it for free; no per-deck markup.
- Captions over a full-bleed `background-image` slide must use `.shot-cap` (shared, opaque background), not `.caption` (plain grey text that vanishes over a busy map).
- **The Causal Map logo always goes in the top-left corner.** Use the shared `.brand` class on the logo image (it pins and sizes it); never centre it or put it in another corner. Inverted white logo on a dark slide, plain logo on a light slide.

## Styling: keep the class set tight

The shared sheet has a habit of accreting one-off classes that get used on a single slide and never again. Resist it. We want a few powerful, composable pieces that an editor (human or AI) can hold in their head, not a long tail of bitty styles.

Rules when adding or changing styles:

- **Compose the axes, do not invent classes.** The system is orthogonal: a **component** (`.flare`/`.hl`, `.panel`, `.bg`, `.chip`, `.card`/`.cards`, `.bignum`) plus a **colour** (`.blue`, `.cyan`, `.teal`, `.green`, `.mint`, `.yellow`, `.pink`, `.mag`, `.navy`, `.grey`) plus **modifiers** (`.light`/`.dark`, `.cascade-2..5`, `.scale-*`, `.place`, `.left`/`.center`/`.right`). So a styled thing is `[x]{.flare .yellow}`, `::: {.panel .teal}`, `::: {.bg .grey}`, never a fused `.panel-teal`. Full map is the `STYLE MAP` header in `_shared/styles.css`; user catalogue is in `README.md`. Reach for these before writing CSS.
- **Colour is variable-only.** A colour class sets `--hue` / `--hue-bright` / `--hue-pale` / `--hue-deep` / `--on` and shows nothing alone; components read those. To add a colour, add a colour class; do not bake colour into a component name.
- **Shared = structure; deck = palette.** Components live in `_shared/styles.css`. A deck retunes the palette by overriding the colour classes' `--hue*` variables in its own `.css` (see `CM-gLocal/cm-glocal.css`), never by copying or redefining the component rules.
- **One-offs stay in the deck.** Anything whimsical or specific to one deck (the gLocal `.mashup`, `.verdict`, `.callout`; the features deck's `.feature-*`) lives in that deck's CSS, not in the shared sheet. (`.shot-cap` was promoted to the shared sheet, since captioning a full-bleed image is a recurring need; gLocal keeps its own palette override of it.)
- **The editor picker reads the CSS**, so any class defined in a deck's stylesheets shows up in the `/` class autocomplete. That makes a tight, well-named set worth more than scattered cleverness.
- A few high-use legacy classes (`.note`, `.takeaway`, `.stat`, `.metric`, `.tiles`) are kept so older decks still render, but marked legacy in the sheet. Prefer the core equivalent for new slides, and migrate a deck's usages when you next touch it.
