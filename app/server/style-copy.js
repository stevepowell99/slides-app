import fs from "node:fs/promises";
import path from "node:path";

// Copy CSS from a source deck into a target deck after a cross-deck paste.
//
// Two modes:
//   "missing"  — default. Only adds rules whose selector isn't already in the
//                target deck's CSS. Only rules that touch a class used by the
//                pasted slide. Never overwrites anything.
//   "override" — copies *all* of the source deck's local CSS. Rules with a
//                matching selector in the target are replaced in-place;
//                other rules are appended. Use to make the pasted slide
//                render exactly as it did in its home deck.
//
// In both modes, :root CSS variable definitions referenced by copied rules
// are also brought across (added or overridden per mode).
//
// Returns { added: [selectors], replaced: [selectors], vars: [varNames], file }
// or { added: [], reason: "..." } when nothing was written.
export async function addMissingStyles(repoRoot, sourceDeck, targetDeck, rawSlideMarkdown, mode = "missing") {
  const sourceCssPaths = await deckLocalCssPaths(repoRoot, sourceDeck);
  if (!sourceCssPaths.length) return { added: [], replaced: [], reason: "source deck has no local CSS" };

  const targetCssPaths = await deckLocalCssPaths(repoRoot, targetDeck);
  if (!targetCssPaths.length) return { added: [], replaced: [], reason: "target deck has no local CSS" };

  const targetCssPath = targetCssPaths[targetCssPaths.length - 1];
  const targetCss = await fs.readFile(targetCssPath, "utf8");
  const targetRules = parseRules(targetCss);
  const targetByKey = new Map();
  for (const rule of targetRules) targetByKey.set(normSelector(rule.selector), rule);

  const sourceCss = await concatFiles(sourceCssPaths);
  const sourceRules = parseRules(sourceCss);

  // Pick which source rules to consider.
  let candidateRules;
  if (mode === "override") {
    candidateRules = sourceRules;
  } else {
    const usedClasses = extractClassesUsed(rawSlideMarkdown);
    if (!usedClasses.size) return { added: [], replaced: [] };
    candidateRules = sourceRules.filter((rule) => selectorMentionsAnyClass(rule.selector, usedClasses));
  }

  // Split into replace-in-target vs append-new.
  const toReplace = []; // [{ target, source }]
  const toAppend = [];  // [sourceRule]
  for (const rule of candidateRules) {
    const existing = targetByKey.get(normSelector(rule.selector));
    if (existing) {
      if (mode === "override") toReplace.push({ target: existing, source: rule });
      // missing-only: skip if already defined
    } else {
      toAppend.push(rule);
    }
  }

  // CSS variables referenced by the rules we're touching.
  const referencedVars = new Set();
  for (const rule of [...toAppend, ...toReplace.map((p) => p.source)]) {
    for (const v of extractVarsUsed(rule.body)) referencedVars.add(v);
  }
  const targetVars = extractVarDefs(targetRules);
  const sourceVars = extractVarDefs(sourceRules);
  const varsToAdd = [];      // new var names that target lacks
  const varsToReplace = [];  // var names target has, source overrides
  for (const v of referencedVars) {
    if (!sourceVars.has(v)) continue;
    if (targetVars.has(v)) {
      if (mode === "override" && sourceVars.get(v) !== targetVars.get(v)) varsToReplace.push(v);
    } else {
      varsToAdd.push(v);
    }
  }

  if (!toReplace.length && !toAppend.length && !varsToAdd.length && !varsToReplace.length) {
    return { added: [], replaced: [] };
  }

  // Build the next target CSS:
  //   1) walk original text, replacing in-place for each rule in toReplace
  //   2) handle :root variable overrides by rewriting the first :root block
  //   3) append new rules (and a new :root block for varsToAdd) at the end
  const replaceMap = new Map();
  for (const pair of toReplace) replaceMap.set(pair.target, pair.source.raw);

  let next = rebuildWithReplacements(targetCss, targetRules, replaceMap);

  // Replace var defs inside existing :root rules.
  if (varsToReplace.length) {
    next = rewriteRootVars(next, varsToReplace, sourceVars);
  }

  // Append additions.
  if (toAppend.length || varsToAdd.length) {
    let addition = `\n\n/* === imported from ${sourceDeck.id} via gallery (${mode}) === */\n`;
    if (varsToAdd.length) {
      addition += `:root {\n`;
      for (const v of varsToAdd) addition += `  ${sourceVars.get(v)}\n`;
      addition += `}\n`;
    }
    for (const rule of toAppend) addition += `${rule.raw}\n`;
    next = next.replace(/\s+$/, "") + addition;
  }

  await fs.writeFile(targetCssPath, next);

  return {
    added: toAppend.map((r) => r.selector),
    replaced: toReplace.map((p) => p.source.selector),
    vars: varsToAdd,
    varsReplaced: varsToReplace,
    file: path.relative(repoRoot, targetCssPath).replace(/\\/g, "/")
  };
}

// --- helpers ---

function extractClassesUsed(rawMarkdown) {
  const text = rawMarkdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");
  const classes = new Set();
  for (const m of text.matchAll(/\{([^}]+)\}/g)) {
    for (const cls of m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) classes.add(cls[1]);
  }
  for (const m of text.matchAll(/class\s*=\s*"([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls) classes.add(cls);
  }
  return classes;
}

function selectorMentionsAnyClass(selector, classes) {
  for (const cls of classes) {
    const re = new RegExp(`\\.${escapeRegex(cls)}(?![A-Za-z0-9_-])`);
    if (re.test(selector)) return true;
  }
  return false;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Parse top-level CSS rules, keeping their start/end positions in the input
// so we can rewrite the file in-place without losing surrounding comments.
function parseRules(cssText) {
  const rules = [];
  let i = 0;
  while (i < cssText.length) {
    // Skip whitespace and /* */ comments before the next rule
    while (i < cssText.length) {
      const ch = cssText[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
      if (cssText.startsWith("/*", i)) {
        const end = cssText.indexOf("*/", i + 2);
        if (end === -1) return rules;
        i = end + 2;
        continue;
      }
      break;
    }
    if (i >= cssText.length) break;
    const start = i;
    const open = cssText.indexOf("{", i);
    if (open === -1) break;
    const selector = cssText.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < cssText.length && depth > 0) {
      if (cssText[j] === "{") depth++;
      else if (cssText[j] === "}") depth--;
      j++;
    }
    if (depth !== 0) break;
    if (selector) {
      const body = cssText.slice(open + 1, j - 1);
      rules.push({ selector, body, raw: cssText.slice(start, j), start, end: j });
    }
    i = j;
  }
  return rules;
}

function rebuildWithReplacements(cssText, rules, replaceMap) {
  if (!replaceMap.size) return cssText;
  let out = "";
  let cursor = 0;
  for (const rule of rules) {
    out += cssText.slice(cursor, rule.start);
    out += replaceMap.has(rule) ? replaceMap.get(rule) : cssText.slice(rule.start, rule.end);
    cursor = rule.end;
  }
  out += cssText.slice(cursor);
  return out;
}

function normSelector(s) { return s.replace(/\s+/g, " ").trim(); }

function extractVarsUsed(ruleBody) {
  const vars = new Set();
  for (const m of ruleBody.matchAll(/var\(\s*--([A-Za-z0-9_-]+)/g)) vars.add(m[1]);
  return vars;
}

function extractVarDefs(rules) {
  const defs = new Map();
  for (const rule of rules) {
    if (!/(^|,|\s):root\b/.test(rule.selector)) continue;
    for (const m of rule.body.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
      defs.set(m[1].slice(2), `${m[1]}: ${m[2].trim()};`);
    }
  }
  return defs;
}

// Rewrite existing --var entries inside :root blocks to the source's values.
function rewriteRootVars(cssText, varNames, sourceVars) {
  return cssText.replace(/(:root\s*\{)([\s\S]*?)(\})/g, (_full, head, body, tail) => {
    let nextBody = body;
    for (const v of varNames) {
      const re = new RegExp(`(--${escapeRegex(v)}\\s*:\\s*)([^;]+)(;)`, "g");
      nextBody = nextBody.replace(re, (_m, k, _val, end) => `${k}${sourceVars.get(v).split(":").slice(1).join(":").trim().replace(/;$/, "")}${end}`);
    }
    return head + nextBody + tail;
  });
}

async function deckLocalCssPaths(repoRoot, deck) {
  const qmdPath = path.join(repoRoot, deck.folder, deck.qmd);
  const source = await fs.readFile(qmdPath, "utf8");
  const paths = extractCssPathsFromFrontMatter(source);
  const deckDir = path.dirname(qmdPath);
  return paths
    .map((p) => path.resolve(deckDir, p))
    .filter((p) => p.startsWith(deckDir + path.sep));
}

function extractCssPathsFromFrontMatter(qmdSource) {
  const match = qmdSource.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const fm = match[1];
  const lines = fm.split(/\r?\n/);
  const cssLineIdx = lines.findIndex((l) => /^\s*css:/.test(l));
  if (cssLineIdx === -1) return [];
  const cssLine = lines[cssLineIdx];
  const cssIndent = cssLine.match(/^(\s*)/)[1].length;
  const inline = cssLine.replace(/^\s*css:\s*/, "").trim();
  if (inline) return [stripQuotes(inline)];
  const out = [];
  for (let i = cssLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= cssIndent) break;
    const item = line.match(/^\s*-\s*(.*)$/);
    if (!item) break;
    out.push(stripQuotes(item[1].trim()));
  }
  return out;
}

function stripQuotes(s) { return s.replace(/^['"]|['"]$/g, ""); }

async function concatFiles(paths) {
  const parts = await Promise.all(paths.map((p) => fs.readFile(p, "utf8").catch(() => "")));
  return parts.join("\n\n");
}
