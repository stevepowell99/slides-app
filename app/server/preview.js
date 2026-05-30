import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { getDeck } from "./decks.js";

const previews = new Map();

export async function startPreview(repoRoot, deckId) {
  const existing = previews.get(deckId);
  if (existing && !existing.process.killed) return existing;

  const deck = await getDeck(repoRoot, deckId);
  const port = await getFreePort();
  const command = process.platform === "win32" ? "quarto.cmd" : "quarto";
  const child = spawn(command, ["preview", deck.qmd, "--no-browser", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(repoRoot, deck.folder),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const preview = {
    deckId,
    port,
    target: `http://127.0.0.1:${port}`,
    process: child,
    logs: []
  };

  child.stdout.on("data", (chunk) => preview.logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => preview.logs.push(chunk.toString()));
  child.on("exit", () => previews.delete(deckId));
  previews.set(deckId, preview);

  return preview;
}

export function getPreview(deckId) {
  return previews.get(deckId);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
