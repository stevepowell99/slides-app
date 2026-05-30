import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getDeck } from "./decks.js";

const renders = new Map();
const pdfRenders = new Map();

export async function renderPdf(repoRoot, deckId) {
  let state = pdfRenders.get(deckId);
  if (!state) {
    state = { running: false, pending: false, promise: null };
    pdfRenders.set(deckId, state);
  }
  if (state.running) {
    state.pending = true;
    return state.promise;
  }
  state.running = true;
  state.pending = false;
  state.promise = doRenderPdf(repoRoot, deckId).finally(async () => {
    state.running = false;
    if (state.pending) {
      state.pending = false;
      return renderPdf(repoRoot, deckId);
    }
  });
  return state.promise;
}

async function doRenderPdf(repoRoot, deckId) {
  const deck = await getDeck(repoRoot, deckId);
  const deckDir = path.join(repoRoot, deck.folder);
  const htmlName = deck.html || deck.qmd.replace(/\.qmd$/i, ".html");
  const pdfName = htmlName.replace(/\.html$/i, ".pdf");

  await runQuartoRender(deckDir, deck.qmd);
  await runDecktape(deckDir, htmlName, pdfName);

  return { pdf: pdfName, html: htmlName };
}

function runDecktape(cwd, htmlName, pdfName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "decktape",
      ["reveal", htmlName, pdfName, "--size", "1280x720"],
      { cwd, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(Object.assign(
          new Error("decktape not installed. Run: npm install -g decktape"),
          { status: 500 }
        ));
      } else {
        reject(err);
      }
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(
        new Error(stderr.trim() || `decktape exited ${code}`),
        { status: 500 }
      ));
    });
  });
}

export async function renderDeck(repoRoot, deckId) {
  let state = renders.get(deckId);
  if (!state) {
    state = { running: false, pending: false, promise: null };
    renders.set(deckId, state);
  }

  if (state.running) {
    state.pending = true;
    return state.promise;
  }

  state.running = true;
  state.pending = false;
  state.promise = doRender(repoRoot, deckId).finally(async () => {
    state.running = false;
    if (state.pending) {
      state.pending = false;
      return renderDeck(repoRoot, deckId);
    }
  });

  return state.promise;
}

async function doRender(repoRoot, deckId) {
  const deck = await getDeck(repoRoot, deckId);
  const deckDir = path.join(repoRoot, deck.folder);
  const htmlName = deck.html || deck.qmd.replace(/\.qmd$/i, ".html");

  await runQuartoRender(deckDir, deck.qmd);

  const htmlPath = path.join(deckDir, htmlName);
  try {
    await fs.access(htmlPath);
  } catch {
    throw Object.assign(new Error(`Render finished but ${htmlName} was not found`), { status: 500 });
  }

  return { html: htmlName };
}

function runQuartoRender(cwd, qmd) {
  return new Promise((resolve, reject) => {
    // --embed-resources only for explicit builds, so a published HTML is
    // self-contained. Live `quarto preview` keeps assets external for speed.
    const child = spawn("quarto", ["render", qmd, "--embed-resources"], {
      cwd,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(Object.assign(new Error(stderr.trim() || `quarto render exited ${code}`), { status: 500 }));
    });
  });
}
