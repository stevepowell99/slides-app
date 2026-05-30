// One-off migration: move per-deck img/paste-*.* into _shared/img/ and rewrite
// the qmd references. Idempotent — safe to re-run; only acts on files matching
// the paste-<digits>.<ext> pattern that were created by the clipboard-paste
// flow (so user-curated img/foo.png stays put).
//
// Usage (from the app/ directory):
//   node scripts/migrate-paste-images.js          # dry run
//   node scripts/migrate-paste-images.js --apply  # actually move + rewrite

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const apply = process.argv.includes("--apply");

const IGNORED = new Set(["app", "_shared", "fontawesome", "features-slides_files", ".quarto"]);
const PASTE_RE = /^paste-\d+\.[A-Za-z0-9]+$/;

async function main() {
  const sharedImgDir = path.join(repoRoot, "_shared", "img");
  if (apply) await fs.mkdir(sharedImgDir, { recursive: true });

  const entries = await fs.readdir(repoRoot, { withFileTypes: true });
  let movedCount = 0;
  let rewrittenCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED.has(entry.name)) continue;
    const deckDir = path.join(repoRoot, entry.name);
    const imgDir = path.join(deckDir, "img");

    let imgFiles = [];
    try {
      imgFiles = await fs.readdir(imgDir);
    } catch { continue; }

    const pasteFiles = imgFiles.filter((name) => PASTE_RE.test(name));
    if (!pasteFiles.length) continue;

    for (const name of pasteFiles) {
      const src = path.join(imgDir, name);
      const dst = path.join(sharedImgDir, name);
      let exists = false;
      try { await fs.access(dst); exists = true; } catch { /* not there */ }

      if (exists) {
        // If a same-named file exists, leave the deck copy alone unless they
        // are byte-identical; rename to avoid collision so we don't lose data.
        const [a, b] = await Promise.all([fs.readFile(src), fs.readFile(dst)]);
        if (a.equals(b)) {
          console.log(`[${entry.name}] ${name}: already in _shared/img (identical) — will remove deck copy`);
          if (apply) await fs.unlink(src);
        } else {
          const ext = path.extname(name);
          const base = name.slice(0, -ext.length);
          const altName = `${base}-${entry.name}${ext}`;
          console.log(`[${entry.name}] ${name}: collision in _shared/img with different bytes → moving as ${altName}`);
          if (apply) {
            await fs.rename(src, path.join(sharedImgDir, altName));
            await rewriteQmd(deckDir, name, altName);
          }
          movedCount++;
          continue;
        }
      } else {
        console.log(`[${entry.name}] ${name}: moving to _shared/img`);
        if (apply) await fs.rename(src, dst);
        movedCount++;
      }
    }

    // Rewrite references in any qmd file in this deck folder.
    const deckEntries = await fs.readdir(deckDir);
    const qmdFiles = deckEntries.filter((n) => n.toLowerCase().endsWith(".qmd"));
    for (const qmd of qmdFiles) {
      const qmdPath = path.join(deckDir, qmd);
      const original = await fs.readFile(qmdPath, "utf8");
      const updated = original.replace(
        /(\]\(|\[\[|src=["'])img\/(paste-\d+\.[A-Za-z0-9]+)/g,
        "$1../_shared/img/$2"
      );
      if (updated !== original) {
        console.log(`  rewriting ${entry.name}/${qmd}`);
        if (apply) await fs.writeFile(qmdPath, updated, "utf8");
        rewrittenCount++;
      }
    }

    // Try removing the deck's img folder if it is now empty.
    if (apply) {
      try {
        const remaining = await fs.readdir(imgDir);
        if (!remaining.length) {
          await fs.rmdir(imgDir);
          console.log(`[${entry.name}] removed empty img/`);
        }
      } catch { /* ignore */ }
    }
  }

  console.log(`\n${apply ? "Migrated" : "Would migrate"}: ${movedCount} image(s) moved, ${rewrittenCount} qmd file(s) rewritten.`);
  if (!apply) console.log("Re-run with --apply to perform the changes.");
}

async function rewriteQmd(deckDir, oldName, newName) {
  const deckEntries = await fs.readdir(deckDir);
  for (const qmd of deckEntries.filter((n) => n.toLowerCase().endsWith(".qmd"))) {
    const qmdPath = path.join(deckDir, qmd);
    const original = await fs.readFile(qmdPath, "utf8");
    const updated = original.replaceAll(`img/${oldName}`, `../_shared/img/${newName}`);
    if (updated !== original) await fs.writeFile(qmdPath, updated, "utf8");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
