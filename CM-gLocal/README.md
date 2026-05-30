# Causal Map / gLocal Eval Week template

A Quarto RevealJS recreation of the brand deck `CM gLocal slides.pptx`. Content is
placeholder; the layout positions, colours and type match the source.

## Design system

| Token | Value | Use |
|-------|-------|-----|
| navy    | `#0E3D5F` | cover, section and closing backgrounds |
| blue    | `#1C79BE` | content-slide headings |
| cyan    | `#00ADEE` | blob motif, YES chip |
| magenta | `#DC378C` | blob motif, call-out box, NO chip |
| white   | `#FFFFFF` | text on navy |

Brand font is **BR Omny** (Bold for headings, Regular for body), embedded in the
source pptx and installed locally. The CSS falls back to Poppins then Segoe UI.

The signature graphic is the interlocking "blob flower" (`assets/blobs.png`),
bled off the right on navy slides and tucked into the bottom-right corner on
white content slides.

## Slide types

Each slide is a level-2 heading (`##`) carrying a layout class. The heading level
is flat on purpose: a level-1 heading would nest the following slides as vertical
sub-slides.

- `{.cover .no-title}` navy. White Causal Map logo top-left, date `.kicker`, big
  white `.cover-title`, blobs right.
- `{.content}` (set `background-color="#ffffff"`). Blue heading top-left,
  QualiaInterviews logo top-right, body wrapped in `::: {.body}`, corner blobs.
  Optional `::: {.callout}` pink box and inline `[YES]{.chip-yes}` /
  `[NO]{.chip-no}` chips.
- `{.section .no-title}` navy divider. White `.section-title` mid-left, Qualia
  logo bottom-left, blobs right.
- `{.closing .no-title}` navy. GEI `.gei-logo` top-left, big white
  `.closing-title`, blobs right.

Body content on content slides must sit inside `::: {.body} ... :::` so the
QualiaInterviews logo keeps the slide, not the body, as its positioning context.

## Workflow

```powershell
quarto preview slides.qmd   # live edit
quarto render slides.qmd    # build slides.html
```

Front matter pulls in `../_shared/preview-bridge.html` and `../_shared/styles.css`
plus `cm-glocal.css`, matching the other decks in this repo.

## Assets

Pulled from the source pptx media:

- `blobs.png` blob-flower motif
- `cm-logo-white.png` white Causal Map logo (navy slides)
- `qualia-logo.png` QualiaInterviews logo (white slides)
- `gei-mark.png` single Global Evaluation Initiative mark (closing)
