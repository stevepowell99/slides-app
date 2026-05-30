import fs from "node:fs/promises";
import path from "node:path";
import { extractCssPaths, extractSlideBlocks, parseQmd } from "./parser.js";

const IGNORED_DIRS = new Set(["app", "_shared", "fontawesome", "features-slides_files"]);

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
// Folders that never hold user images we'd want to insert.
const IMAGE_SKIP_DIRS = new Set(["app", "node_modules", "dist", ".quarto", ".git", "_tmp", "fontawesome"]);

// Every image across the repo (deck folders + _shared), for the image picker.
// Returns repo-relative POSIX paths; the frontend rewrites them relative to the
// active deck folder for insertion. Skips build output (`*_files`), caches and
// the app itself.
export async function listAllImages(repoRoot) {
  const out = [];
  async function walk(absDir, relDir) {
    let entries;
    try { entries = await fs.readdir(absDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IMAGE_SKIP_DIRS.has(entry.name) || entry.name.startsWith(".") || entry.name.endsWith("_files")) continue;
        await walk(path.join(absDir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      const stat = await fs.stat(path.join(absDir, entry.name)).catch(() => null);
      out.push({
        path: relPath,
        folder: relDir || "(root)",
        filename: entry.name,
        size: stat?.size || 0,
        mtime: stat?.mtimeMs || 0
      });
    }
  }
  await walk(repoRoot, "");
  out.sort((a, b) => b.mtime - a.mtime); // most recent first
  return out;
}

// Strip markdown noise so the gallery excerpt reads as plain prose.
const EXCERPT_MAX = 220;
function makeExcerpt(rawBlock) {
  const lines = rawBlock.split(/\r?\n/);
  // Drop the heading line; everything after is body.
  const body = lines.slice(1).join("\n");
  let text = body
    .replace(/^:::.*$/gm, "")            // fenced-div fences
    .replace(/^```[\s\S]*?^```/gm, "")   // code fences
    .replace(/^!?\[[^\]]*\]\([^)]*\)/gm, "") // images / links on own line
    .replace(/<[^>]+>/g, "")             // raw html tags
    .replace(/\{[^}]*\}/g, "")           // attribute blocks
    .replace(/[*_`>#]+/g, "")            // markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > EXCERPT_MAX) text = text.slice(0, EXCERPT_MAX - 1).trimEnd() + "…";
  return text;
}

function parseBgColor(attr) {
  const m = attr && attr.match(/background-color\s*=\s*"([^"]+)"/);
  return m ? m[1] : "";
}

// Concatenate the deck's CSS so the background lookup sees everything that
// affects the rendered background: the compiled revealjs theme first (it
// carries the theme's real `--r-background-color`), then the deck's own
// `css:` front-matter files which may override `.reveal`/`.reveal-viewport`.
async function readDeckCss(repoRoot, deck, qmdSource) {
  const deckDir = path.join(repoRoot, deck.folder);
  const rels = extractCssPaths(qmdSource);
  const texts = await Promise.all(
    rels.map((rel) => fs.readFile(path.resolve(deckDir, rel), "utf8").catch(() => ""))
  );
  const themeCss = await compiledThemeCss(deckDir, deck.qmd);
  return [themeCss, ...texts].join("\n\n");
}

// The revealjs theme CSS Quarto emits into the rendered output, if present.
// Path: <deck>/<qmdbase>_files/libs/revealjs/dist/theme/*.css
async function compiledThemeCss(deckDir, qmd) {
  const qmdBase = qmd.replace(/\.qmd$/i, "");
  const themeDir = path.join(deckDir, `${qmdBase}_files`, "libs", "revealjs", "dist", "theme");
  try {
    const files = await fs.readdir(themeDir);
    const css = files.find((f) => f.endsWith(".css"));
    if (css) return await fs.readFile(path.join(themeDir, css), "utf8");
  } catch { /* deck not rendered yet */ }
  return "";
}

// The deck's effective slide background, used when a slide sets no per-slide
// background-color. Scans the combined CSS (compiled theme + deck overrides)
// for `.reveal` / `.reveal-viewport` background, resolving `var(--x)` against
// :root. Later rules win, so a deck override beats the theme default.
function deckBackground(cssText) {
  const text = (cssText || "").replace(/\/\*[\s\S]*?\*\//g, "");

  const vars = new Map();
  for (const m of text.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const v of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars.set(v[1], v[2].trim());
    }
  }

  const resolve = (value) => {
    let v = value.trim();
    const varMatch = v.match(/var\(\s*(--[\w-]+)/);
    if (varMatch) v = vars.get(varMatch[1]) || "";
    if (/var\(/.test(v)) return ""; // still unresolved
    return v.split(/\s+/)[0]; // first token of a shorthand
  };

  let bg = "";
  for (const m of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    if (!/^\.reveal(-viewport)?$/.test(selector)) continue;
    // Prefer an explicit colour; resolve the last background declaration.
    const decls = [...m[2].matchAll(/background(?:-color)?\s*:\s*([^;]+);/g)];
    for (const d of decls) {
      const resolved = resolve(d[1]);
      if (resolved) bg = resolved; // later declaration / rule wins
    }
  }
  return bg;
}

// Build a deck descriptor from a single folder, or null if it is not a deck
// (no .qmd, ignored, or an id that tries to escape the repo root). Reading just
// the one folder keeps getDeck O(1); it used to scan every deck on every call.
async function describeDeck(repoRoot, name) {
  if (IGNORED_DIRS.has(name) || name !== path.basename(name)) return null;
  const deckDir = path.join(repoRoot, name);
  let files;
  try { files = await fs.readdir(deckDir); }
  catch { return null; }
  const qmd = files.find((file) => file.toLowerCase().endsWith(".qmd"));
  if (!qmd) return null;

  const source = await fs.readFile(path.join(deckDir, qmd), "utf8");
  const metadata = parseFrontMatter(source);
  return {
    id: name,
    folder: name,
    qmd,
    html: outputHtmlFor(qmd, files),
    title: metadata.pagetitle || metadata.title || name,
    date: metadata.date || "",
    slideCount: parseQmd(source).slides.length
  };
}

export async function listDecks(repoRoot) {
  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  const decks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const deck = await describeDeck(repoRoot, entry.name);
    if (deck) decks.push(deck);
  }
  return decks.sort((a, b) => a.title.localeCompare(b.title));
}

// Flat list of every slide across every deck, with metadata for the gallery.
// Each entry has the raw markdown block so the frontend can paste it directly.
export async function listAllSlides(repoRoot) {
  const decks = await listDecks(repoRoot);
  const out = [];
  for (const deck of decks) {
    const filePath = path.join(repoRoot, deck.folder, deck.qmd);
    const source = await fs.readFile(filePath, "utf8");
    const { slides } = parseQmd(source);
    const ids = slides.map((s) => s.id);
    const blocks = extractSlideBlocks(source, ids);
    const deckCss = await readDeckCss(repoRoot, deck, source);
    const deckBg = deckBackground(deckCss);
    slides.forEach((slide, i) => {
      const rawBlock = blocks[i] || "";
      out.push({
        deckId: deck.id,
        deckTitle: deck.title,
        slideId: slide.id,
        index: slide.index,
        title: slide.title,
        level: slide.level,
        hidden: slide.hidden,
        noTitle: slide.noTitle,
        backgroundColor: parseBgColor(slide.attr) || deckBg,
        excerpt: makeExcerpt(rawBlock),
        rawBlock
      });
    });
  }
  return out;
}

export async function getDeck(repoRoot, deckId) {
  const deck = await describeDeck(repoRoot, deckId);
  if (!deck) throw Object.assign(new Error("Deck not found"), { status: 404 });
  return deck;
}

export async function readDeckSource(repoRoot, deckId) {
  const deck = await getDeck(repoRoot, deckId);
  const filePath = deckSourcePath(repoRoot, deck);
  const source = await fs.readFile(filePath, "utf8");
  return {
    deck,
    source,
    parsed: parseQmd(source)
  };
}

export async function writeDeckSource(repoRoot, deckId, source) {
  const deck = await getDeck(repoRoot, deckId);
  const filePath = deckSourcePath(repoRoot, deck);
  await fs.writeFile(filePath, source, "utf8");
  return readDeckSource(repoRoot, deckId);
}

export async function createDeck(repoRoot, title) {
  const safeName = await uniqueDeckName(repoRoot, slugify(title || "new-project"));
  const deckDir = path.join(repoRoot, safeName);
  const qmd = "slides.qmd";

  await fs.mkdir(deckDir);
  await fs.writeFile(path.join(deckDir, qmd), newDeckSource(title || "New project"), "utf8");
  return getDeck(repoRoot, safeName);
}

export async function cloneDeck(repoRoot, deckId, title = "") {
  const sourceDeck = await getDeck(repoRoot, deckId);
  const baseName = title ? slugify(title) : `${sourceDeck.folder}-copy`;
  const safeName = await uniqueDeckName(repoRoot, baseName);
  const sourceDir = path.join(repoRoot, sourceDeck.folder);
  const targetDir = path.join(repoRoot, safeName);

  await fs.cp(sourceDir, targetDir, { recursive: true });

  if (title) {
    const qmdPath = path.join(targetDir, sourceDeck.qmd);
    const source = await fs.readFile(qmdPath, "utf8");
    await fs.writeFile(qmdPath, setPageTitle(source, title), "utf8");
  }

  return getDeck(repoRoot, safeName);
}

export async function setDeckTitle(repoRoot, deckId, title) {
  const deck = await getDeck(repoRoot, deckId);
  const filePath = deckSourcePath(repoRoot, deck);
  const source = await fs.readFile(filePath, "utf8");
  await fs.writeFile(filePath, setPageTitle(source, title), "utf8");
  return getDeck(repoRoot, deckId);
}

export async function deleteDeck(repoRoot, deckId) {
  const deck = await getDeck(repoRoot, deckId);
  const targetDir = path.resolve(repoRoot, deck.folder);
  const root = path.resolve(repoRoot);

  if (!targetDir.startsWith(root + path.sep)) {
    throw Object.assign(new Error("Invalid deck path"), { status: 400 });
  }

  // Retry: Quarto preview / Google Drive sync / Windows Defender may still hold
  // handles for several seconds after the process was killed.
  await fs.rm(targetDir, { recursive: true, force: true, maxRetries: 25, retryDelay: 600 });
  return { deleted: deckId };
}

export function deckSourcePath(repoRoot, deck) {
  const filePath = path.resolve(repoRoot, deck.folder, deck.qmd);
  const root = path.resolve(repoRoot);
  if (!filePath.startsWith(root + path.sep)) {
    throw Object.assign(new Error("Invalid deck path"), { status: 400 });
  }
  return filePath;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueDeckName(repoRoot, baseName) {
  let candidate = baseName;
  let index = 2;

  while (await exists(path.join(repoRoot, candidate))) {
    candidate = `${baseName}-${index}`;
    index += 1;
  }

  return candidate;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "new-project";
}

function newDeckSource(title) {
  return `---
pagetitle: "${title.replace(/"/g, "'")}"
format:
  revealjs:
    theme: simple
    slide-number: true
    transition: fade
    incremental: false
    width: 1280
    height: 720
    include-in-header:
      - ../_shared/preview-bridge.html
    css: ../_shared/styles.css
---

# {.center .title-page background-color="#1b1b3a"}

::: {.headline}
${title}
:::

## First slide

Start writing here.
`;
}

function parseFrontMatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*"?([^"]*)"?\s*$/))
      .filter(Boolean)
      .map((matchLine) => [matchLine[1], matchLine[2]])
  );
}

function setPageTitle(source, title) {
  const escaped = title.replace(/"/g, "'");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    const block = `---\npagetitle: "${escaped}"\n---\n\n`;
    return block + source;
  }

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const headerStart = match.index + 4;
  const headerEnd = headerStart + match[1].length;
  const header = source.slice(headerStart, headerEnd);
  const headerLines = header.split(/\r?\n/);
  const idx = headerLines.findIndex((line) => /^pagetitle\s*:/i.test(line));

  if (idx >= 0) headerLines[idx] = `pagetitle: "${escaped}"`;
  else headerLines.unshift(`pagetitle: "${escaped}"`);

  return source.slice(0, headerStart) + headerLines.join(eol) + source.slice(headerEnd);
}

function outputHtmlFor(qmd, files) {
  const expected = qmd.replace(/\.qmd$/i, ".html");
  if (files.includes(expected)) return expected;
  return files.find((file) => file.toLowerCase().endsWith(".html") && !file.toLowerCase().includes("print")) || "";
}
