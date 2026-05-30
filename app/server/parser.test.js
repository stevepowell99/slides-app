import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applySlideAction, parseQmd } from "./parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("parses Amsterdam deck headings and reveal positions", async () => {
  const source = await fs.readFile(path.join(repoRoot, "Amsterdam-UMC", "slides.qmd"), "utf8");
  const parsed = parseQmd(source);

  assert.equal(parsed.slides[0].level, 1);
  assert.equal(parsed.slides[0].h, 0);
  assert.equal(parsed.slides[1].level, 2);
  assert.equal(parsed.slides[1].h, 0);
  assert.equal(parsed.slides[1].v, 1);
});

test("parses feature deck section groups", async () => {
  const source = await fs.readFile(path.join(repoRoot, "cm-features", "features-slides.qmd"), "utf8");
  const parsed = parseQmd(source);
  const section = parsed.slides.find((slide) => slide.title === "Getting started");
  const child = parsed.slides.find((slide) => slide.title === "Free example project");

  assert.equal(section.level, 1);
  assert.equal(child.groupId, section.id);
});

test("toggles visibility=hidden on a heading", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## A slide {.feature-slide}", "", "Body"].join("\n");
  const parsed = parseQmd(source);
  const hidden = applySlideAction(source, { type: "hide", slideIds: [parsed.slides[0].id] });
  const shown = applySlideAction(hidden, { type: "show", slideIds: [parseQmd(hidden).slides[0].id] });

  assert.match(hidden, /visibility="hidden"/);
  assert.doesNotMatch(shown, /visibility="hidden"/);
  // Preserves the existing class on both
  assert.match(hidden, /\.feature-slide/);
  assert.match(shown, /\.feature-slide/);
});

test("ignores ## inside Pandoc fenced divs (e.g. callout titles)", () => {
  const source = [
    "---", "pagetitle: Test", "---", "",
    "## Real slide",
    "", "body",
    "",
    "::: {.callout-warning}",
    "## DON'T",
    "- a", "- b",
    ":::",
    "",
    "::: {.callout-tip}",
    "## DO",
    "- c",
    ":::",
    "",
    "## Next real slide", "body"
  ].join("\n");
  const parsed = parseQmd(source);
  assert.equal(parsed.slides.length, 2);
  assert.equal(parsed.slides[0].title, "Real slide");
  assert.equal(parsed.slides[1].title, "Next real slide");
});

test("rename accepts a full heading line so you can change level and attrs", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## Old {.feature-slide}", "", "Body"].join("\n");
  const parsed = parseQmd(source);
  // Title-only input preserves level and existing attrs.
  const titleOnly = applySlideAction(source, { type: "rename", slideId: parsed.slides[0].id, title: "Just title" });
  assert.match(titleOnly, /## Just title \{\.feature-slide\}/);
  // Full heading line replaces the line entirely (here: change level to # and add no-title).
  const full = applySlideAction(source, { type: "rename", slideId: parsed.slides[0].id, title: "# New {.no-title}" });
  assert.match(full, /^# New \{\.no-title\}$/m);
  // Slide now exposes rawHeading and reflects the new level.
  const reparsed = parseQmd(full);
  assert.equal(reparsed.slides[0].level, 1);
  assert.equal(reparsed.slides[0].rawHeading, "# New {.no-title}");
});

test("toggles no-title on a heading and exposes noTitle flag", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## A slide {.feature-slide}", "", "Body"].join("\n");
  const parsed = parseQmd(source);
  assert.equal(parsed.slides[0].noTitle, false);
  const noTitle = applySlideAction(source, { type: "hide-title", slideIds: [parsed.slides[0].id] });
  const withTitle = applySlideAction(noTitle, { type: "show-title", slideIds: [parseQmd(noTitle).slides[0].id] });

  assert.match(noTitle, /\.no-title/);
  assert.doesNotMatch(withTitle, /\.no-title/);
  assert.equal(parseQmd(noTitle).slides[0].noTitle, true);
  assert.match(withTitle, /\.feature-slide/);
});

test("computes Reveal visible indices that skip hidden slides", () => {
  const source = [
    "---", "pagetitle: Test", "---", "",
    "## A", "", "body A",
    "", "## B {visibility=\"hidden\"}", "", "body B",
    "", "## C", "", "body C"
  ].join("\n");
  const parsed = parseQmd(source);
  const [a, b, c] = parsed.slides;
  assert.equal(a.visibleH, 0); assert.equal(a.visibleV, 0);
  assert.equal(b.visibleH, -1); assert.equal(b.visibleV, -1);
  assert.equal(c.visibleH, 0); assert.equal(c.visibleV, 1);
});

test("show normalises away the legacy .hidden-slide class", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## Old {.hidden-slide}", "", "Body"].join("\n");
  const parsed = parseQmd(source);
  assert.equal(parsed.slides[0].hidden, true);
  const shown = applySlideAction(source, { type: "show", slideIds: [parsed.slides[0].id] });
  assert.doesNotMatch(shown, /\.hidden-slide/);
  assert.doesNotMatch(shown, /visibility="hidden"/);
});

test("moves selected slides as a block", () => {
  const source = [
    "---",
    "pagetitle: Test",
    "---",
    "",
    "## First",
    "",
    "A",
    "",
    "## Second",
    "",
    "B",
    "",
    "## Third",
    "",
    "C"
  ].join("\n");
  const parsed = parseQmd(source);
  const moved = applySlideAction(source, {
    type: "move",
    slideIds: [parsed.slides[1].id, parsed.slides[2].id],
    beforeSlideId: parsed.slides[0].id
  });

  assert.ok(moved.indexOf("## Second") < moved.indexOf("## Third"));
  assert.ok(moved.indexOf("## Third") < moved.indexOf("## First"));
});

test("renames a slide and preserves attributes", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## Old title {.feature-slide}", "", "Body"].join("\n");
  const parsed = parseQmd(source);
  const renamed = applySlideAction(source, { type: "rename", slideId: parsed.slides[0].id, title: "New title" });

  assert.match(renamed, /## New title \{\.feature-slide\}/);
});

test("moves selected slides to the end", () => {
  const source = ["---", "pagetitle: Test", "---", "", "## First", "", "A", "", "## Second", "", "B"].join("\n");
  const parsed = parseQmd(source);
  const moved = applySlideAction(source, {
    type: "move",
    slideIds: [parsed.slides[0].id],
    beforeSlideId: "__end"
  });

  assert.ok(moved.indexOf("## Second") < moved.indexOf("## First"));
});
