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

Amsterdam also has a render script:

```powershell
.\Amsterdam-UMC\render.bat
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

## Show/Hide Slides

Hidden slides use a single source convention:

```markdown
## Slide title {.hidden-slide}
```

The app only toggles this class. It does not comment out slides or store sidecar metadata.

## Build Static HTML

Click **Build static HTML** in the deck rail to run `quarto render` once. Use this when you want a publishable HTML file alongside the `.qmd`.

## Git/File Sync

When this folder is initialised as a git repo, commit the source files you want to sync. Generated HTML/PDF can either be committed for static hosting or regenerated locally; choose one policy and keep it consistent.
