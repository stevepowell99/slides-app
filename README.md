# Slide App

Make consistent, good-looking slide decks from plain text, on your own machine, with a live preview, and let an AI assistant draft them for you if you want.

![Three-pane editor screenshot](.assets/editor.png)
*The three-pane editor: decks and the slide list on the left, the current slide's text in the middle, the live slideshow on the right.*

## Why plain-text decks

Most slide tools keep each deck in a binary file. Styling drifts from one deck to the next, reusing a slide means copy, paste and reformat by hand, and an AI assistant cannot read or write the deck for you.

Here every deck is plain text: a Markdown file (`.qmd`) plus its CSS and images, in a folder on your computer. There is no database; those files are the source of truth. That one choice is what makes decks consistent (they share styles), reusable (lift a slide or image from any other deck), easy for an assistant to draft, and yours to keep, with no lock-in.

Two open-source tools do the work under the hood, and the app drives both for you so you rarely touch them directly:

- [Quarto](https://quarto.org) turns each Markdown deck into a slideshow.
- [reveal.js](https://revealjs.com) is the engine that runs that slideshow in the browser.

## Features

- **Build consistent decks.** Shared styles and project-wide defaults keep every deck looking the same, and any deck can override them.
- **Reuse slides and images across decks.** Pick a slide from another deck and either keep its original look or adapt it to the current deck's styles. Reuse any image from any deck through a picker.
- **Find a deck fast.** A search box matches decks by title, filename or slide contents, and the rail keeps the decks you opened most recently at the top.
- **Write in plain text.** Each deck is Markdown, split into slides by headings, so any editor works and nothing is locked in a database.
- **Edit with slash commands.** Type `/` for columns, spans, fenced divs, images, fragments and speaker notes, with tab-through placeholders.
- **Edit in a capable editor.** Find and replace, multiple cursors, move and copy lines, and class autocomplete drawn from the deck's own CSS. Familiar formatting shortcuts toggle markup on a selection or at the cursor: `Ctrl+B` bold, `Ctrl+I` italic, `` Ctrl+` `` code, `Ctrl+Shift+X` strikethrough, `Ctrl+Shift+H` highlight, `Ctrl+K` link.
- **Preview live.** The real reveal.js deck, side by side with the editor: speaker notes, an overview grid, step-by-step reveals, and a progress bar.
- **Navigate both ways.** Selecting a slide moves the preview; moving in the preview selects the slide.
- **Paste images straight into the editor.** They save to a shared folder and insert at the cursor, so copied slides keep working in other decks.
- **Let an AI write the slides.** A deck is just text, so an assistant can draft a whole deck for you and you refine it here.
- **Export and publish.** Produce a self-contained HTML file or a PDF from any deck (the PDF saves beside the deck and downloads in your browser), and publish chosen decks as a read-only website, with an optional PDF download link per deck.
- **Start from a theme.** The repo ships with several demo decks (brutalist, editorial, moonlight, pastel cards, terminal) showing distinct looks you can clone.

## Install and run

First install two free tools, both with standard installers: [Node.js](https://nodejs.org), which runs the editor app, and [Quarto](https://quarto.org/docs/get-started/), which renders the decks and powers the preview.

Then get the code. Either clone it with git:

```powershell
git clone <repo-url> slide-app
```

or, if you do not use git, open the project's GitHub page, click the green **Code** button, choose **Download ZIP**, and unzip it somewhere.

Now open a terminal in that folder and start the app:

```powershell
cd slide-app          # the folder you cloned or unzipped
npm run install:app   # one time, downloads the app's dependencies
npm start             # builds the app, then serves it at http://127.0.0.1:3210
```

The first `npm start` takes a moment to build. When it prints that it is listening, open http://127.0.0.1:3210 in a browser, pick a deck on the left, and edit. Press `Ctrl+Enter` or `Ctrl+S` (or click **Save**) to update the preview. To stop the app, press `Ctrl+C` in the terminal.

Everything runs locally; nothing is uploaded. `npm start` always rebuilds first so it reflects the current code; use `npm run serve` to skip the rebuild for a faster restart. The app itself lives in `app/`, but the root forwards these commands into it, so you never need to `cd app`. Developed on Windows with PowerShell, but it runs anywhere Node and Quarto do.

The repo comes with example decks: a `welcome` walkthrough, the theme demos, and a few real talks. Open them to see what is possible, clone one as a starting point, or delete the ones you do not want. Make your own with **New project**.

## Make slides

The window has three columns:

- **Left:** a search box and the deck list. **New project** at the top; hover a deck card for rename, clone, build HTML, build PDF and delete.
- **Middle:** the slide list on top, the body editor for the selected slide below.
- **Right:** the live preview.

![Deck list screenshot](.assets/sidebar.png)
*The deck list: New project and a search box at the top, then a card per deck. Hovering a card reveals rename, clone, build HTML, build PDF and delete.*

The slide list supports:

- Click to select (the editor and preview both jump to that slide)
- Checkbox to multi-select
- Drag to reorder
- Double-click to rename
- Hover a row for its actions (hide, copy, duplicate, delete, and more); hover the gap between rows for a `+` to insert a slide
- Right-click for the same actions, applied to a multi-selection

Copy, duplicate, delete and move act on exactly the slides you select, nothing more. A `#` section header is itself a slide, so selecting it affects only that slide, not the slides beneath it.

![Slide row actions screenshot](.assets/slide-actions.png)
*Hover a slide row for its actions, or the gap between rows for a + to insert a new slide.*

**Editing does not touch disk until you save.** Type freely; the preview does not reload on every keystroke. Press `Ctrl+Enter` (or `Ctrl+S`, or click **Save**) to write the deck to disk and refresh the preview. Switching deck saves the one you are leaving, and the slide actions (new, delete, move, paste, rename) save as they go. Closing the tab with unsaved edits prompts first.

**Saves never clobber outside changes.** If the deck's file changed on disk since you opened it (edited in another tool, or left in a stale tab), the app refuses the save and reloads the file instead of overwriting it. It tells you the unsaved edits were not written, so two writers can't silently overwrite each other.

**Slash commands and class autocomplete.** In the body editor, type `/` at the start of a line to insert structures: `/columns`, `/column`, `/span`, `/div`, `/image`, `/columns3`, `/fragment`, `/notes`. `Tab` jumps between the placeholders. Select text and press `/` to wrap it in a styled span with the class picker already open. Type `.` inside an attribute block (`::: {.`, `[text]{.`, `## Title {.`) to pick from the classes the active deck's CSS actually defines, each tagged shared or deck, so a class only appears where it will work.

**Reuse across decks.** The slide gallery lists every slide in every deck; pick one and choose whether it keeps its original look or adapts to the current deck's styles (the CSS it needs comes across either way). A separate image gallery drops any image from any deck into the slide you are editing. Pasting an image from the clipboard saves it to a shared folder and inserts a reference at the cursor, so a slide you copy elsewhere keeps its picture.

![Slide gallery screenshot](.assets/slide-picker.png)
*The slide gallery: every slide from every deck, in its own colours, ready to reuse with or without its original styling.*

![Image gallery screenshot](.assets/image-picker.png)
*The image gallery: every image across your decks, searchable by name or folder.*

## Present

Open a deck in the preview (or the published page) and use the reveal.js controls:

- **Arrows** or **Space** move through the slides one at a time, in order.
- **`F`** goes full screen; **`Esc`** opens the overview grid, where you can click any slide to jump to it.
- **`S`** opens the speaker view, with your notes and a timer. Write notes by wrapping a block in `::: {.notes}` ... `:::`.
- **Fragments** reveal content one step at a time within a slide.
- A faint **breadcrumb** in the corner shows the current section, and a **progress bar** tracks position.
- **`?`** lists every keyboard shortcut.

### How the arrows move

By default the arrows are *linear*: `→` and `↓` both go to the next slide, so you walk straight through. To make them two-dimensional instead, so `→`/`←` step between sections and `↓`/`↑` move within a section, set `navigation-mode` in a deck's front matter (or in `_quarto.yml` for every deck):

```yaml
format:
  revealjs:
    navigation-mode: vertical
```

The values are `linear` (the default), `vertical` (the two-dimensional mode just described), and `grid` (like `vertical`, but `→`/`←` keep your depth within a section as you cross between them).

## Writing a deck

You can write or tweak decks by hand in any text editor, not just in the app. Each deck is one folder containing a `.qmd` Markdown file, plus any CSS and images it uses, for example `my-deck/slides.qmd`.

Slides are separated by Markdown headings:

- `#` starts a title or section slide
- `##` is a normal slide, sitting under the preceding `#` section

This grouping is what gives the breadcrumb its section name and the overview its across-and-down layout.

### Front matter

For the app's preview to find the shared styles and the navigation bridge, each deck's `revealjs` front matter needs:

```yaml
format:
  revealjs:
    include-in-header:
      - ../_shared/preview-bridge.html
    css:
      - ../_shared/styles.css
```

New decks created from the app already include this.

**Title slides: use a heading, not `title:`.** If you set `title:` (or `subtitle:`) in front matter, Quarto builds an automatic title slide that has no heading in the source, so it cannot be selected or edited in the slide list. Instead make the title slide a real heading:

```markdown
# {.center .title-page background-color="#1F1F36"}

::: {.headline}
Your title, with an [accent]{.teal}
:::

::: {.subhead}
Your subtitle
:::
```

`.title-page` and its `.headline` / `.subhead` / `.eyebrow` / `.byline` / `.urls` children are styled in `_shared/styles.css` for a dark background, so keep the `background-color`. Use `pagetitle:` if you want a browser-tab title without creating a slide. The bundled demo decks show the pattern.

### Shared styles and defaults

`_quarto.yml` sets project-wide defaults that any deck can override in its own front matter (for example `transition`, `transition-speed`, `progress`). `_shared/styles.css` holds the styles every deck shares, including the title-page layout and the section breadcrumb. A deck inherits all of it and overrides only what it needs, so a set of decks looks like a set rather than a pile.

The breadcrumb shows the current `#` section's title in a corner. Decks with no `#` headings show nothing; to switch it off for a deck, add to its `include-in-header`:

```html
<script>window.SLIDE_BREADCRUMB = false</script>
```

`_shared/styles.css` defines a small set of reusable styles that **compose from a few orthogonal axes**, rather than many single-use classes: pick a component, add a colour, add modifiers. Reach for these before writing new CSS, and keep any one-off, deck-specific flourish in that deck's own `.css` file.

**Components** (what a thing is):

- **Highlights** (inline, on a span): `.flare` is an animated highlight (it flares in, then settles to its colour); `.hl` is the same look without the animation. Combine with a colour: `[important]{.flare .yellow}`, `[note]{.hl .blue}`.
- **Panels** (a tinted box with an accent left border): `.panel` plus a colour, as in `::: {.panel .teal}`. `.panel` alone is a plain padded box.
- **Cards**: `::: {.cards}` is a responsive grid; fill it with a plain list (one card per `-` item) or with explicit `::: {.card}` blocks you can colour individually (`::: {.card .blue}`). `.panel` blocks work too. Add `.cols-2/3/4` for a fixed column count.
- **Nesting (nested layouts)**: panels, cards and columns nest freely, and composing them is the main way to turn a flat slide into a structured one. Reach for a nested card or column layout whenever content has structure (groups, steps, side-by-side comparisons) instead of settling for a bullet list; it reads far better on a slide. Keep it to two or three levels so the slide stays legible. You can put subcards inside a card, a `.panel` inside a column, or columns inside a column, and you can tint any container with `.bg` plus a colour to see the structure while you build. The **Layouts** demo deck (`layouts/`) is the worked reference, worth opening before you build anything non-trivial. Two fence rules:
  - `.columns` take four colons (`::::`) and `.column` take three (`:::`); because the two alternate, nested column layouts pair up correctly. Equal-length fences for nested columns render wrong in Quarto.
  - Other containers (`.cards`, `.card`, `.panel`, `.bg`) nest with three-colon `:::` fences; each closing `:::` closes the innermost open one.

  ```markdown
  :::: {.columns}
  ::: {.column width="50%"}
  left

  :::: {.columns}
  ::: {.column width="50%"}
  inner left
  :::
  ::: {.column width="50%"}
  inner right
  :::
  ::::
  :::
  ::: {.column width="50%"}
  right
  :::
  ::::
  ```

  Cards nest with equal `:::` fences, for example a task card holding one numbered step-card each (leave off `.cols-N` on the inner grid so the step cards stack in the narrow column):

  ```markdown
  ::: {.cards .cols-3}
  ::: {.card .grey}
  **Collect**

  ::: {.cards}
  ::: {.card}
  [1]{.chip} Start from the question
  :::
  ::: {.card}
  [2]{.chip} Gather the data
  :::
  :::
  :::
  ::: {.card .teal}
  **Code**

  ::: {.cards}
  ::: {.card}
  [3]{.chip} Manage the codebook
  :::
  :::
  :::
  :::
  ```

  To restyle just these chips on one slide (say a white badge), give the slide heading a class such as `## The nine steps {.nine-steps}` and add a scoped raw-HTML `<style>` block setting `.reveal .nine-steps .chip{background:#fff;color:#1F1F36;}`, rather than editing the shared CSS.
- **Tint**: `.bg` plus a colour is a flat background fill with no border or padding (`::: {.bg .grey}`).
- **Chips** (inline pill): `.chip` plus a colour, as in `[yes]{.chip .mint}`.
- **Big number**, a headline figure beside a note:

  ```markdown
  ::: {.bignum}
  ::: {.fig}
  90<small>%</small>
  :::
  ::: {.bn-body}
  of claims code cleanly as a single link.
  :::
  :::
  ```

**Colours** (one fixed hue each, variable-only, they show nothing on their own): `.blue`, `.cyan`, `.teal`, `.green`, `.mint`, `.yellow`, `.pink`, `.mag`, `.navy`, `.grey`. A component renders the colour at a sensible shade (highlights vivid, panels pale).

**Modifiers:**

- **Shade**: `.light` (pale) or `.dark` (deep), e.g. `::: {.panel .navy .dark}` for a dark box, `[x]{.flare .blue .light}` for a pale highlight.
- **Order**: `.cascade-2` to `.cascade-5` on later flares so several on a line fire in turn: `[a]{.flare .cyan}` then `[b]{.flare .yellow .cascade-2}`.
- **Size**: `.scale-50` to `.scale-500` (a percentage) shrink or grow everything in a block (text, icons, images), or any amount via `::: {.scale style="--scale:0.83"}`. This is the single sizing control; use it for big icons instead of FontAwesome's `.fa-2x` to `.fa-10x`.
- **Place**: `::: {.place style="top:30%; left:54%"}` floats a block anywhere over the slide.
- **Align**: `.left` / `.center` / `.right`.

**Text helpers**: `.lead` (a larger intro line), `.caption` (small caption under a figure, plain text with no background), `.shot-cap` (a caption for a full-bleed `background-image` slide, pinned to the bottom on a mostly opaque dark fill so it stays readable over a map or screenshot, where `.caption` would not), `.accent` (accent-coloured emphasis).

**Brand logo**: `.brand` on a logo image pins it to the top-left corner, the logo's fixed home: `![](../_shared/img/causal-map-logo-no-straplineRGB-inverted.png){.brand}` (use the inverted white logo on a dark slide, the plain one on a light slide). Drop any width attribute; the class sizes it.

**Recolouring.** A deck retunes the palette by overriding the colour classes' `--hue*` variables in its own `.css` (for example `.reveal .blue { --hue: #1C79BE; ... }`), never by redefining the component rules. See `CM-gLocal/cm-glocal.css`.

**Legacy** (still work in the old decks that include `legacy.css`, but prefer a core piece for new slides): `.note` becomes `.panel .yellow`, `.takeaway` becomes `.panel .navy .dark`, `.tiles` becomes `.cards`, `.stat` / `.metric` become `.bignum` or `.cards`.

### Hiding a slide

Add `{.hidden-slide}` to a heading to skip the slide in the show while keeping it in the source:

```markdown
## Slide title {.hidden-slide}
```

The hide/show buttons in the slide list just toggle this class.

## Export and publish

**One file or a PDF.** **Build static HTML** writes a single self-contained `.html` beside the `.qmd`, handy for emailing a deck. **Build PDF** renders the deck to PDF, saves it beside the `.qmd`, and downloads it in your browser. The PDF route uses [decktape](https://github.com/astefanutti/decktape), so run `npm install -g decktape` once before using it.

**A read-only website.** You can put chosen decks online as a static site on any static host. These steps use [Netlify](https://www.netlify.com), but the idea is the same anywhere: Quarto runs only on your machine, so you render locally and upload the finished HTML.

1. **Mark the decks you want public.** Add `public: true` to a deck's front matter. Decks without it stay private and are left out of the site.

   ```yaml
   ---
   public: true
   ---
   ```

2. **Build the site.** From the repo root:

   ```powershell
   .\build-site.ps1
   ```

   This renders every public deck into `_site/`: one self-contained `_site/<deck>/index.html` per deck, plus a landing page (`_site/index.html`) listing them. It wipes and rebuilds `_site/` each run, so the folder always matches your current `public:` flags. The landing page sorts decks by title; add `order:` to a deck's front matter to pin it higher (the same key orders the rail in the app).

   **Offer a PDF download.** If a public deck has a PDF beside it (from **Build PDF**), the build copies it into `_site/<deck>/` and the landing page shows a small **PDF** link next to that deck. Decks without one show no link, so add a downloadable PDF simply by building and committing it. Browser print-to-PDF is not used; the committed decktape PDF keeps the deck's real styling.

3. **Deploy.** Either drag the `_site/` folder onto Netlify's deploy page, or push the repo to GitHub and connect it in Netlify with **build command** empty and **publish directory** `_site`. Then every push redeploys. For a private link, switch on the host's password protection.

## Repo notes

A few things worth knowing if you fork this to manage your own decks.

**What is committed.** The source `.qmd`, CSS and images are committed, along with the generated `_site/`. The throwaway per-deck renders (`slides.html`) are ignored; only `_site/` is published. A deck's `slides.pdf` is committed when you want it offered as a download (the build copies it into `_site/`). Because the host serves the committed `_site/`, it must be rebuilt before any push that changes a deck.

**Automatic rebuilds.** A tracked `pre-commit` hook does this for you: when a commit touches a `.qmd`, `_shared/`, or `build-site.ps1`, it runs `build-site.ps1` and stages `_site/` into the same commit. Point your clone at the hooks once (git cannot do this for you):

```powershell
git config core.hooksPath hooks
```

It needs PowerShell 7 (`pwsh`) on PATH; without it the hook stops and asks you to run `build-site.ps1` yourself. Bypass the hook with `git commit --no-verify`.

**How the panes stay in sync.** The preview is the real rendered deck in an `iframe`. A small bridge script (`_shared/preview-bridge.html`) reports the deck's actual slides back to the app and accepts go-to commands, so the slide list, editor and preview always agree on which slide is which, even with title slides, hidden slides or nested layouts. You do not need to think about this; it just keeps the three panes together.
