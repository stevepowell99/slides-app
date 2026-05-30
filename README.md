# Local Quarto Slide Decks

A workspace for building [Quarto](https://quarto.org) RevealJS slide decks, with a local web app that edits and previews them side by side. Each deck is plain Markdown (`.qmd`) in its own folder, so you can work in any editor or in the app. There is no database: the `.qmd`, CSS, and images are the source of truth.

The app gives you a three-pane editor (deck list, per-slide editor, live preview) with drag-to-reorder, rename, hide/show, and two-way navigation between the slide list and the embedded preview.

## Quick start

Run the app:

```powershell
cd app
npm install
npm run dev
```

Open the printed local URL, pick a deck on the left, and edit. Press `Ctrl+Enter` or **Render** to update the preview.

Or work in Quarto directly, from any deck folder:

```powershell
quarto preview slides.qmd
```

Requirements: [Quarto](https://quarto.org/docs/get-started/) and [Node.js](https://nodejs.org). Developed on Windows with PowerShell; the app runs anywhere Node and Quarto do.

The rest of this README covers the details: deck layout, the app's editing model, deck front matter, and building static HTML.

## Deck Layout

Each slideshow is in its own subfolder.

- `Amsterdam-UMC/slides.qmd`
- `cm-features/features-slides.qmd`

Slides are separated by Markdown headings:

- `#` for title or section slides
- `##` for normal slides

## Quarto Workflow

You can keep using Quarto directly.

From a deck folder:

```powershell
quarto preview slides.qmd
```

Or use the existing batch files:

```powershell
.\Amsterdam-UMC\preview.bat
.\cm-features\preview-features.bat
```


## Local Web App

The app is in `app/`. It edits the same `.qmd` files and embeds `quarto preview` for the live view.

```powershell
cd app
npm install
npm run dev
```

Open the printed local URL. The layout has three columns:

- **Left**: deck list, plus New / Clone / Delete / Build static HTML.
- **Middle (split)**: slide list on top, body editor for the selected slide on the bottom.
- **Right**: embedded `quarto preview`. It reloads when the `.qmd` is written to disk, which only happens when you render (see below), not on every keystroke.

The slide list supports:

- Click to select (the body editor and preview both jump to that slide)
- Checkbox to multi-select
- Drag to reorder
- Double-click to rename (preserves heading attributes such as `{.hidden-slide}`)
- Right-click for hide/show/copy/paste/delete

Slide navigation is bidirectional. A small bridge script (`_shared/preview-bridge.html`, injected via `include-in-header`) exchanges `postMessage` events with the parent:

- Selecting a slide in the rail sends `{type:'goto', h, v}` to the iframe, which calls `Reveal.slide(h, v)`. No reload.
- Navigating inside the iframe (arrow keys, slide menu, links) posts a `slidechanged` event back, and the rail and body editor follow.

Editing does not touch disk. The body is spliced into an in-memory copy of the `.qmd` and the slide list re-parses locally, so typing never reloads the preview. To render, press `Ctrl+Enter` or click **Render**: the in-memory `.qmd` is written to disk, Quarto's file watcher reloads the iframe, and the bridge re-attaches and re-sends the current slide. Switching deck renders the deck you are leaving so edits persist; the slide actions (new, delete, move, paste, rename) also write and render.

The `.qmd` file on disk is the source of truth once rendered. Because edits live in memory until you render, closing the tab with unsaved edits prompts first. The per-slide editor only edits the body of one slide at a time.

## Deck Front Matter

For the embedded preview to find shared CSS and the bridge script, each deck's `revealjs` front matter needs:

```yaml
format:
  revealjs:
    embed-resources: true
    include-in-header:
      - ../_shared/preview-bridge.html
    css:
      - ../_shared/styles.css
```

`embed-resources: true` is required because `quarto preview` serves only the deck folder; assets at `../_shared/` cannot be fetched at runtime and have to be inlined at render time. New decks created from the app already include these settings.

## Shared Defaults

`_quarto.yml` sets project-wide RevealJS defaults that any deck can override in its own front matter:

- `transition: slide` and `transition-speed: slow`
- `progress: true`

To override, set the same key in a deck's `revealjs` block, for example `transition: none` or `progress: false`.

## Section Breadcrumb

Every deck shows a faint label in the bottom-left corner with the title of the current `#` section, so you keep your place in a larger deck. It is driven by a small script in `_shared/preview-bridge.html` and styled by `.slide-breadcrumb` in `_shared/styles.css`, so it applies to all decks automatically and updates as you navigate.

Decks with no `#` section headings show nothing. To switch it off for a single deck, set this before Reveal initialises by adding to that deck's `include-in-header`:

```html
<script>window.SLIDE_BREADCRUMB = false</script>
```

## Show/Hide Slides

Hidden slides use a single source convention:

```markdown
## Slide title {.hidden-slide}
```

The app only toggles this class. It does not comment out slides or store sidecar metadata.

## Build Static HTML

Click **Build static HTML** in the deck rail to run `quarto render` once. Use this when you want a publishable HTML file alongside the `.qmd`.

## Publish to Netlify

The decks are hosted read-only on Netlify as static files. Netlify has no Quarto, so we render locally and publish the rendered HTML rather than rebuilding on Netlify.

**Mark a deck public.** Add `public: true` to a deck's front matter and give it `embed-resources: true` so it renders to a single self-contained file:

```yaml
---
public: true
format:
  revealjs:
    embed-resources: true
---
```

Decks without `public: true` are left out of the published site, so demos and works in progress stay private.

**Build the site.** From the repo root:

```powershell
.\build-site.ps1
```

The script reads every deck's front matter, renders the public ones, and writes them into `_site/`:

- `_site/<deck>/index.html` for each public deck (one self-contained file)
- `_site/index.html`, a landing page listing the decks, with theme demos in their own group

It wipes and rebuilds `_site/` each run, so the folder always matches the current `public` flags.

**Deploy.** Commit `_site/` and push. In Netlify, connect this GitHub repo with:

- Build command: empty
- Publish directory: `_site`

Every push redeploys. Read-only is automatic; static hosting has no edit path. For a private link, switch on Netlify's site password protection.

## Git/File Sync

Source `.qmd`, CSS, images, and the generated `_site/` are committed. In-deck renders (`slides.html`, `features-slides.html`) stay ignored; the published copies live only in `_site/`. Run `.\build-site.ps1` and commit before pushing so the live site matches the source.

Quarto output is deterministic, so rebuilding a deck whose source is unchanged produces the same file and adds nothing to git history. Only decks you actually edit write new blobs. `.gitattributes` marks `_site/` as generated so git and GitHub treat the inlined-base64 files as binary rather than rendering multi-MB diffs.
