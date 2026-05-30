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
- **Export and publish.** Produce a self-contained HTML file or a PDF from any deck, and publish chosen decks as a read-only website.
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

![Slide row actions screenshot](.assets/slide-actions.png)
*Hover a slide row for its actions, or the gap between rows for a + to insert a new slide.*

**Editing does not touch disk until you save.** Type freely; the preview does not reload on every keystroke. Press `Ctrl+Enter` (or `Ctrl+S`, or click **Save**) to write the deck to disk and refresh the preview. Switching deck saves the one you are leaving, and the slide actions (new, delete, move, paste, rename) save as they go. Closing the tab with unsaved edits prompts first.

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

`_shared/styles.css` also defines reusable content classes. Wrap a block in a fenced div to apply one, for example `::: {.panel .panel-teal}` ... `:::`:

- **Highlights** (inline, on a span): `.hl-blue`, `.hl-yellow`, `.hl-pink`, `.hl-green` add a coloured highlight behind text, as in `[important]{.hl-yellow}`.
- **Background-only blocks**: `.bg-blue`, `.bg-green`, `.bg-teal`, `.bg-yellow`, `.bg-pink`, `.bg-grey` add a pale fill and nothing else.
- **Panels** (padded box with a left border): `.panel` plus one of `.panel-blue`, `.panel-green`, `.panel-teal`, `.panel-grey`. Related boxes: `.note` (amber), `.examples` (grey), `.quote` (teal), `.takeaway` (dark).
- **Stat pills** (inline): `.stat` plus `.stat-blue`, `.stat-green`, `.stat-teal`.

### Hiding a slide

Add `{.hidden-slide}` to a heading to skip the slide in the show while keeping it in the source:

```markdown
## Slide title {.hidden-slide}
```

The hide/show buttons in the slide list just toggle this class.

## Export and publish

**One file or a PDF.** Use **Build static HTML** in the deck rail (or **Build PDF**) to produce a single self-contained file alongside the `.qmd`, handy for emailing a deck.

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

3. **Deploy.** Either drag the `_site/` folder onto Netlify's deploy page, or push the repo to GitHub and connect it in Netlify with **build command** empty and **publish directory** `_site`. Then every push redeploys. For a private link, switch on the host's password protection.

## Repo notes

A few things worth knowing if you fork this to manage your own decks.

**What is committed.** The source `.qmd`, CSS and images are committed, along with the generated `_site/`. The throwaway per-deck renders (`slides.html`) are ignored; only `_site/` is published. Because the host serves the committed `_site/`, it must be rebuilt before any push that changes a deck.

**Automatic rebuilds.** A tracked `pre-commit` hook does this for you: when a commit touches a `.qmd`, `_shared/`, or `build-site.ps1`, it runs `build-site.ps1` and stages `_site/` into the same commit. Point your clone at the hooks once (git cannot do this for you):

```powershell
git config core.hooksPath hooks
```

It needs PowerShell 7 (`pwsh`) on PATH; without it the hook stops and asks you to run `build-site.ps1` yourself. Bypass the hook with `git commit --no-verify`.

**How the panes stay in sync.** The preview is the real rendered deck in an `iframe`. A small bridge script (`_shared/preview-bridge.html`) reports the deck's actual slides back to the app and accepts go-to commands, so the slide list, editor and preview always agree on which slide is which, even with title slides, hidden slides or nested layouts. You do not need to think about this; it just keeps the three panes together.
