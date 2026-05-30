import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { applySlideAction, extractSlideBlocks } from "./parser.js";
import {
  cloneDeck, createDeck, deleteDeck, getDeck, IMAGE_EXTENSIONS, listAllImages, listAllSlides,
  listDecks, listDeckSearchIndex, readDeckSource, setDeckTitle, writeDeckSource
} from "./decks.js";
import { renderDeck, renderPdf } from "./render.js";
import { startPreview, stopPreview, stopAll } from "./preview-process.js";
import { addMissingStyles, listDeckClasses } from "./style-copy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const app = express();
const port = Number(process.env.PORT || 3210);
const HOST = "127.0.0.1";

app.use(express.json({ limit: "10mb" }));

// Decks
app.get("/api/decks", asyncHandler(async (_req, res) => res.json(await listDecks(repoRoot))));
// Searchable content per deck, for the rail's search box.
app.get("/api/decks/index", asyncHandler(async (_req, res) => res.json(await listDeckSearchIndex(repoRoot))));
app.post("/api/decks", asyncHandler(async (req, res) =>
  res.status(201).json(await createDeck(repoRoot, req.body.title))
));
app.get("/api/decks/:deck/source", asyncHandler(async (req, res) =>
  res.json(await readDeckSource(repoRoot, req.params.deck))
));
app.put("/api/decks/:deck/source", asyncHandler(async (req, res) => {
  if (typeof req.body.source !== "string") {
    res.status(400).json({ error: "source must be a string" });
    return;
  }
  res.json(await writeDeckSource(repoRoot, req.params.deck, req.body.source));
}));
// Classes defined in the CSS this deck includes. Feeds the editor's style picker.
app.get("/api/decks/:deck/classes", asyncHandler(async (req, res) =>
  res.json(await listDeckClasses(repoRoot, await getDeck(repoRoot, req.params.deck)))
));
app.post("/api/decks/:deck/clone", asyncHandler(async (req, res) =>
  res.status(201).json(await cloneDeck(repoRoot, req.params.deck, req.body.title || ""))
));
app.put("/api/decks/:deck/title", asyncHandler(async (req, res) => {
  if (typeof req.body.title !== "string" || !req.body.title.trim()) {
    res.status(400).json({ error: "title must be a non-empty string" });
    return;
  }
  res.json(await setDeckTitle(repoRoot, req.params.deck, req.body.title.trim()));
}));
app.delete("/api/decks/:deck", asyncHandler(async (req, res) => {
  // Quarto preview holds file handles inside the deck folder; kill it before rm,
  // then wait briefly for Windows to release the process's cwd handle.
  stopPreview(req.params.deck);
  await new Promise((resolve) => setTimeout(resolve, 500));
  res.json(await deleteDeck(repoRoot, req.params.deck));
}));

// All slides across all decks — feeds the cross-deck gallery picker.
app.get("/api/slides/all", asyncHandler(async (_req, res) =>
  res.json(await listAllSlides(repoRoot))
));

// All images across the repo — feeds the editor's image picker.
app.get("/api/images/all", asyncHandler(async (_req, res) =>
  res.json(await listAllImages(repoRoot))
));

// Serve repo images for thumbnails. Restricted to image extensions;
// express.static keeps requests inside repoRoot (no path traversal).
app.use("/media", (req, res, next) => {
  if (!IMAGE_EXTENSIONS.has(path.extname(req.path).toLowerCase())) {
    res.status(415).end();
    return;
  }
  next();
}, express.static(repoRoot, { index: false, dotfiles: "deny" }));

// Slide actions on the .qmd source (hide/show/copy/paste/move/delete)
app.post("/api/decks/:deck/slides/copy", asyncHandler(async (req, res) => {
  const source = await deckSourceForAction(repoRoot, req.params.deck, req.body);
  res.json({ blocks: extractSlideBlocks(source, req.body.slideIds || []) });
}));
app.post("/api/decks/:deck/slides/apply", asyncHandler(async (req, res) => {
  const source = await deckSourceForAction(repoRoot, req.params.deck, req.body);
  const nextSource = applySlideAction(source, req.body);
  const written = await writeDeckSource(repoRoot, req.params.deck, nextSource);

  // Cross-deck paste: copy any class definitions the pasted slide uses
  // that aren't already defined in the target deck's CSS.
  let stylesAdded = null;
  if (req.body.type === "paste" && req.body.sourceDeckId
      && req.body.sourceDeckId !== req.params.deck) {
    const sourceDeck = await getDeck(repoRoot, req.body.sourceDeckId);
    const targetDeck = await getDeck(repoRoot, req.params.deck);
    const slideText = (req.body.blocks || []).join("\n\n");
    const mode = req.body.styleMode === "override" ? "override" : "missing";
    stylesAdded = await addMissingStyles(repoRoot, sourceDeck, targetDeck, slideText, mode);
  }

  res.json({ ...written, stylesAdded });
}));

// Live preview: spawn `quarto preview` per deck and hand back its URL.
// The right-pane iframe loads this URL directly. Slide navigation works by
// appending a `#/h/v` fragment to the iframe src.
app.post("/api/decks/:deck/preview", asyncHandler(async (req, res) =>
  res.json(await startPreview(repoRoot, req.params.deck))
));
app.delete("/api/decks/:deck/preview", asyncHandler(async (req, res) => {
  stopPreview(req.params.deck);
  res.json({ stopped: req.params.deck });
}));

// Save a pasted image into the shared image folder at the repo root and
// return a path that works from inside any deck folder. Keeping images
// global means copying slides between decks doesn't break references.
app.post(
  "/api/decks/:deck/images",
  express.raw({ type: () => true, limit: "20mb" }),
  asyncHandler(async (req, res) => {
    await getDeck(repoRoot, req.params.deck); // validate deck exists
    const ext = extForContentType(req.headers["content-type"] || "");
    const filename = `paste-${Date.now()}.${ext}`;
    const imgDir = path.join(repoRoot, "_shared", "img");
    await fs.mkdir(imgDir, { recursive: true });
    await fs.writeFile(path.join(imgDir, filename), req.body);
    res.json({ path: `../_shared/img/${filename}`, filename });
  })
);

// Explicit one-off `quarto render` for producing a publishable HTML file.
app.post("/api/decks/:deck/build", asyncHandler(async (req, res) =>
  res.json(await renderDeck(repoRoot, req.params.deck))
));

// Render to PDF via Quarto + decktape (requires `npm install -g decktape`).
app.post("/api/decks/:deck/pdf", asyncHandler(async (req, res) =>
  res.json(await renderPdf(repoRoot, req.params.deck))
));

// Built frontend
const distPath = path.join(appRoot, "dist");
app.use(express.static(distPath));
app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, "index.html")));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Unexpected error" });
});

let server;

function startListening(attempt = 0) {
  server = app.listen(port, HOST);
  server.once("listening", () => {
    console.log(`Local Slide App API listening on http://${HOST}:${port}`);
    warmUpQuarto();
  });
  server.once("error", (err) => {
    if (err.code !== "EADDRINUSE" || attempt >= 5) {
      console.error(err);
      process.exit(1);
    }
    // A previous dev server (often in another terminal) still owns the port.
    // Kill its whole process tree, then retry once the OS frees the socket.
    const killed = killPortOwner(port);
    console.warn(`Port ${port} busy${killed ? ", killed previous owner" : ""}; retrying…`);
    setTimeout(() => startListening(attempt + 1), 600);
  });
}

// Kill the port owner up front so a stale server never blocks the bind in the
// first place. The listen-error path above is the backstop for a slow release.
killPortOwner(port);
startListening();

// The first `quarto preview` after a cold start pays the full toolchain init
// cost (deno load, format resolution, first render). On Windows + Google Drive,
// with antivirus scanning deno.exe on first run, that can exceed the readiness
// timeout, so the user's first deck appears to "time out" while any subsequent
// deck (warm toolchain) loads fine. Pay that cost in the background at boot so
// the user's first real preview hits a warm Quarto.
let warmedUp = false;
async function warmUpQuarto() {
  if (warmedUp) return;
  warmedUp = true;
  try {
    const decks = await listDecks(repoRoot);
    if (!decks.length) return;
    console.log(`Warming up Quarto with "${decks[0].id}"…`);
    // Fire-and-forget: starts/keeps a preview the user may reuse; errors ignored.
    startPreview(repoRoot, decks[0].id)
      .then(() => console.log("Quarto warm-up ready"))
      .catch((err) => console.warn(`Quarto warm-up did not finish: ${err.message}`));
  } catch { /* ignore */ }
}

// Make sure spawned `quarto preview` processes don't outlive us.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopAll(); server?.close(() => process.exit(0)); });
}

// Kill whatever process is listening on `port` (e.g. a stale dev server left
// running in another terminal) so a restart binds cleanly. Kills the whole
// process tree (/T) and never kills our own PID. Returns true if it killed
// something.
function killPortOwner(targetPort) {
  const self = String(process.pid);
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" }).stdout || "";
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes("LISTENING") || !line.includes(`:${targetPort} `)) continue;
        const pid = line.trim().split(/\s+/).pop();
        if (/^\d+$/.test(pid) && pid !== self) pids.add(pid);
      }
      for (const pid of pids) {
        spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", timeout: 4000 });
      }
    } else {
      const out = spawnSync("lsof", ["-ti", `:${targetPort}`], { encoding: "utf8" }).stdout || "";
      for (const pid of out.split(/\s+/).filter(Boolean)) if (pid !== self) pids.add(pid);
      for (const pid of pids) spawnSync("kill", ["-9", pid]);
    }
  } catch (e) {
    console.warn(`Could not free port ${targetPort}: ${e.message}`);
  }
  return pids.size > 0;
}

async function deckSourceForAction(repoRoot, deckId, body) {
  if (typeof body.source === "string") return body.source;
  return (await readDeckSource(repoRoot, deckId)).source;
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function extForContentType(contentType) {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  return "png";
}
