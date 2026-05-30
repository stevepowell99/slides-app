// Smoke-test addMissingStyles against a temp copy of the decks. No server.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import url from "node:url";

const REPO = path.resolve(url.fileURLToPath(import.meta.url), "../..");
const TMP = await fs.mkdtemp(path.join(os.tmpdir(), "slides-test-"));

async function cp(src, dst) {
  await fs.cp(src, dst, { recursive: true });
}

await cp(path.join(REPO, "_shared"), path.join(TMP, "_shared"));
await cp(path.join(REPO, "demo-brutalist"), path.join(TMP, "demo-brutalist"));
await cp(path.join(REPO, "demo-moonlight"), path.join(TMP, "demo-moonlight"));
await fs.copyFile(path.join(REPO, "_quarto.yml"), path.join(TMP, "_quarto.yml"));
console.log("temp root:", TMP);

// Pull in the modules from the real app/ (so we get the real implementation)
const { listAllSlides, getDeck } = await import(url.pathToFileURL(path.join(REPO, "app/server/decks.js")).href);
const { addMissingStyles } = await import(url.pathToFileURL(path.join(REPO, "app/server/style-copy.js")).href);

const slides = await listAllSlides(TMP);
const splitSlide = slides.find((s) => s.deckId === "demo-brutalist" && s.title === "SPLIT");
if (!splitSlide) throw new Error("SPLIT slide not found");

console.log("\nsource slide raw block (first 400 chars):");
console.log(splitSlide.rawBlock.slice(0, 400));

const sourceDeck = await getDeck(TMP, "demo-brutalist");
const targetDeck = await getDeck(TMP, "demo-moonlight");

const beforeCss = await fs.readFile(path.join(TMP, "demo-moonlight/moonlight.css"), "utf8");
const result = await addMissingStyles(TMP, sourceDeck, targetDeck, splitSlide.rawBlock, "missing");
const afterCss = await fs.readFile(path.join(TMP, "demo-moonlight/moonlight.css"), "utf8");

console.log("\n=== MISSING-ONLY MODE ===");
console.log("result:", JSON.stringify(result, null, 2));
console.log("---- appended ----");
console.log(afterCss.slice(beforeCss.length));

// Re-run missing-only: should add nothing.
const again = await addMissingStyles(TMP, sourceDeck, targetDeck, splitSlide.rawBlock, "missing");
console.log("\nsecond missing run:", JSON.stringify(again, null, 2));

// Restore moonlight.css and try override mode.
await fs.writeFile(path.join(TMP, "demo-moonlight/moonlight.css"), beforeCss);
const override = await addMissingStyles(TMP, sourceDeck, targetDeck, splitSlide.rawBlock, "override");
const overrideCss = await fs.readFile(path.join(TMP, "demo-moonlight/moonlight.css"), "utf8");
console.log("\n\n=== OVERRIDE MODE ===");
console.log("added:", override.added.length, "replaced:", override.replaced.length,
            "vars+:", override.vars?.length, "vars~:", override.varsReplaced?.length);
console.log("file size before/after:", beforeCss.length, "->", overrideCss.length);

// Spot-check: target had `.reveal h2 { ... }` originally. Did the source's
// version replace it in-place (not appended)?
const h2BeforeIdx = beforeCss.indexOf(".reveal h2");
const h2AfterIdx = overrideCss.indexOf(".reveal h2");
console.log("`.reveal h2` index:", h2BeforeIdx, "->", h2AfterIdx,
            "(in-place if both > 0 and close)");

// Re-run override: should replace what's there, add nothing new.
const override2 = await addMissingStyles(TMP, sourceDeck, targetDeck, splitSlide.rawBlock, "override");
console.log("second override run:", "added:", override2.added.length, "replaced:", override2.replaced.length);
