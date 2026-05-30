// Spawn `quarto preview` per deck. The right-pane iframe loads the URL we
// return here. Quarto's stdout/stderr is mirrored to the app server log so
// render failures don't disappear into the void.

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { getDeck } from "./decks.js";

const previews = new Map(); // deckId -> { process, url, port, ready: Promise }

export async function startPreview(repoRoot, deckId) {
  // Coalesce concurrent starts for the same deck (React StrictMode double-mount
  // would otherwise fire two POSTs; the second used to return the URL before
  // Quarto was ready, breaking the iframe).
  const existing = previews.get(deckId);
  if (existing && existing.process && !existing.process.killed && existing.process.exitCode === null) {
    if (existing.ready) await existing.ready;
    return { url: existing.url, port: existing.port };
  }

  const deck = await getDeck(repoRoot, deckId);
  const port = await getFreePort();

  // Run from the repo root so Quarto's `_quarto.yml` (project mode) kicks in.
  // That lets ../_shared and ../fontawesome resolve in the preview server.
  const htmlName = deck.html || deck.qmd.replace(/\.qmd$/i, ".html");
  const docPath = `${deck.folder}/${deck.qmd}`;
  const url = `http://127.0.0.1:${port}/${encodeURI(deck.folder)}/${encodeURI(htmlName)}`;

  const child = spawn(
    "quarto",
    ["preview", docPath, "--no-browser", "--host", "127.0.0.1", "--port", String(port)],
    { cwd: repoRoot, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] }
  );

  const tag = `[quarto:${deckId}]`;
  let lastError = "";

  child.on("exit", (code) => {
    previews.delete(deckId);
    if (code) console.error(`${tag} exited with code ${code}`);
  });
  child.on("error", (err) => {
    previews.delete(deckId);
    console.error(`${tag} failed to spawn: ${err.message}`);
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`${tag} ${chunk}`));
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    lastError += text;
    process.stderr.write(`${tag} ${text}`);
  });

  // Quarto binds the port early but returns 404 until the first render is
  // done. With `embed-resources: true` the first render inlines every asset
  // and can take 30-60 s on a large deck.
  const ready = waitForOk(url, 120000).then(
    () => true,
    () => {
      stopPreview(deckId);
      const detail = lastError.trim().split(/\r?\n/).slice(-5).join("\n");
      throw Object.assign(
        new Error(`Quarto preview did not start in time${detail ? `:\n${detail}` : ""}`),
        { status: 500 }
      );
    }
  );

  previews.set(deckId, { process: child, url, port, ready });

  await ready;
  return { url, port };
}

export function stopPreview(deckId) {
  const entry = previews.get(deckId);
  if (!entry) return;
  killTree(entry.process);
  previews.delete(deckId);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    // /T kills the whole tree (Quarto -> Deno child), /F forces it.
    try { spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]); } catch { /* ignore */ }
  } else {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
  }
}

export function stopAll() {
  for (const deckId of Array.from(previews.keys())) stopPreview(deckId);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForOk(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryFetch = async () => {
      try {
        const response = await fetch(url, { redirect: "manual" });
        if (response.status >= 200 && response.status < 400) {
          resolve(true);
          return;
        }
      } catch { /* not listening yet */ }
      if (Date.now() > deadline) reject(new Error("timeout"));
      else setTimeout(tryFetch, 400);
    };
    tryFetch();
  });
}
