const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function parseQmd(text) {
  const frontMatterMatch = text.match(FRONT_MATTER);
  const frontMatterEnd = frontMatterMatch ? frontMatterMatch[0].split(/\r?\n/).length - 1 : 0;
  const lines = text.split(/\r?\n/);
  const headings = [];
  let inFence = false;
  let currentGroupId = null;

  lines.forEach((line, index) => {
    // Track code fences so a `#` inside a code block is not read as a heading.
    if (/^```|^~~~/.test(line.trim())) {
      inFence = !inFence;
      return;
    }
    if (inFence || index + 1 <= frontMatterEnd) return;

    // In Quarto reveal a level-1/2 heading at column 0 always starts a new
    // slide, even inside a fenced div (the heading ends the div). So detect
    // headings regardless of `:::` nesting. The old code counted div depth and
    // skipped headings while inside a div; an unbalanced or miscounted `:::`
    // left the depth stuck, so later headings were missed and a slide's endLine
    // ran to end-of-file, which let a single-slide save truncate everything
    // after it. Keying off the heading itself cannot get stuck.
    const match = line.match(/^(#{1,2})\s*(.*?)\s*$/);
    if (!match) return;

    const level = match[1].length;
    const parsedTitle = parseHeadingTitle(match[2]);

    const slide = {
      id: `slide-${headings.length + 1}`,
      index: headings.length,
      // Kept raw (may be empty for an attribute-only heading) so it can be
      // matched against the rendered deck's heading text. Display fallbacks
      // live in the UI, not here.
      title: parsedTitle.title,
      level,
      headingLine: index + 1,
      startLine: index + 1,
      endLine: lines.length,
      attr: parsedTitle.attr,
      classes: parsedTitle.classes,
      hidden: /visibility\s*=\s*"hidden"/.test(parsedTitle.attr)
        || parsedTitle.classes.includes("hidden-slide"),
      noTitle: parsedTitle.classes.includes("no-title"),
      rawHeading: line,
      groupId: null
    };

    // h1 sections group their h2 children together.
    if (level === 1) {
      slide.groupId = slide.id;
      currentGroupId = slide.id;
    } else {
      slide.groupId = currentGroupId || slide.id;
    }

    headings.push(slide);
  });

  headings.forEach((slide, index) => {
    slide.endLine = index + 1 < headings.length ? headings[index + 1].startLine - 1 : lines.length;
  });

  // Slide geometry (which heading is which Reveal h/v) is NOT computed here.
  // Reproducing Quarto's layout in regex drifts from the real rendered deck
  // (merged headings, auto title slide, slide-level). Navigation now keys off
  // the rendered deck itself: the preview bridge reports each slide's real
  // (h, v); the app aligns these headings to that list by order.
  return {
    frontMatterEnd,
    slides: headings
  };
}

export function applySlideAction(text, action) {
  const parsed = parseQmd(text);
  // Every action operates on exactly the slides selected. A section header
  // (`#`) is just a slide; selecting it never pulls in its section's children.
  const selected = new Set(action.slideIds || []);

  if (action.type === "hide" || action.type === "show") {
    return toggleHiddenClass(text, parsed.slides, selected, action.type === "hide");
  }

  if (action.type === "hide-title" || action.type === "show-title") {
    return toggleNoTitleClass(text, parsed.slides, selected, action.type === "hide-title");
  }

  if (action.type === "delete") {
    return removeSlides(text, parsed.slides, selected);
  }

  if (action.type === "paste") {
    return pasteSlides(text, parsed.slides, action.afterSlideId, action.blocks || []);
  }

  if (action.type === "new") {
    return pasteSlides(text, parsed.slides, action.afterSlideId, [`## ${action.title || "New slide"}\n`]);
  }

  if (action.type === "duplicate") {
    const blocks = extractSlideBlocks(text, [action.slideId]);
    if (!blocks.length) return text;
    return pasteSlides(text, parsed.slides, action.slideId, blocks);
  }

  if (action.type === "move") {
    return moveSlides(text, parsed.slides, selected, action.beforeSlideId);
  }

  if (action.type === "rename") {
    return renameSlide(text, parsed.slides, action.slideId, action.title || "");
  }

  throw new Error(`Unsupported slide action: ${action.type}`);
}

export function extractSlideBlocks(text, slideIds) {
  const parsed = parseQmd(text);
  // Copy exactly the slides selected, nothing more. A section header (`#`) is
  // itself a slide with its own content, so it copies its own block (down to
  // the next heading) like any other; it does not drag its section's children.
  const selected = new Set(slideIds || []);
  const lines = text.split(/\r?\n/);

  return parsed.slides
    .filter((slide) => selected.has(slide.id))
    .map((slide) => lines.slice(slide.startLine - 1, slide.endLine).join("\n"));
}

function toggleHiddenClass(text, slides, selected, shouldHide) {
  const lines = text.split(/\r?\n/);

  slides.forEach((slide) => {
    if (!selected.has(slide.id)) return;
    const lineIndex = slide.headingLine - 1;
    // visibility="hidden" is Reveal's real "skip this slide" attribute. The
    // legacy `.hidden-slide` class is stripped on show so old decks normalise
    // to the attribute-based form.
    let line = lines[lineIndex];
    line = setHeadingClass(line, "hidden-slide", false);
    line = setVisibilityHidden(line, shouldHide);
    lines[lineIndex] = line;
  });

  return lines.join("\n");
}

function toggleNoTitleClass(text, slides, selected, shouldHide) {
  const lines = text.split(/\r?\n/);
  slides.forEach((slide) => {
    if (!selected.has(slide.id)) return;
    const lineIndex = slide.headingLine - 1;
    lines[lineIndex] = setHeadingClass(lines[lineIndex], "no-title", shouldHide);
  });
  return lines.join("\n");
}

function setVisibilityHidden(line, hidden) {
  const attrMatch = line.match(/\s*(\{[^}]*\})\s*$/);
  if (!attrMatch) {
    return hidden ? `${line.trimEnd()} {visibility="hidden"}` : line;
  }
  const attr = attrMatch[1];
  const body = line.slice(0, line.length - attr.length).trimEnd();
  let inner = attr.slice(1, -1)
    .replace(/(^|\s)visibility\s*=\s*"[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (hidden) inner = inner ? `${inner} visibility="hidden"` : `visibility="hidden"`;
  return inner ? `${body} {${inner}}` : body;
}

function removeSlides(text, slides, selected) {
  const lines = text.split(/\r?\n/);
  const keep = lines.filter((_, index) => {
    const lineNumber = index + 1;
    return !slides.some((slide) => selected.has(slide.id) && lineNumber >= slide.startLine && lineNumber <= slide.endLine);
  });

  return keep.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function pasteSlides(text, slides, afterSlideId, blocks) {
  if (!blocks.length) return text;
  const lines = text.split(/\r?\n/);
  const target = slides.find((slide) => slide.id === afterSlideId);
  const insertAt = target ? target.endLine : lines.length;
  const cleanBlocks = blocks.map((block) => block.trim()).filter(Boolean);

  lines.splice(insertAt, 0, "", ...cleanBlocks.join("\n\n").split("\n"), "");
  return lines.join("\n");
}

function moveSlides(text, slides, selected, beforeSlideId) {
  const target = beforeSlideId === "__end" ? null : slides.find((slide) => slide.id === beforeSlideId);
  if (beforeSlideId !== "__end" && (!target || selected.has(target.id))) return text;

  const lines = text.split(/\r?\n/);
  const ranges = slides
    .filter((slide) => selected.has(slide.id))
    .map((slide) => ({ start: slide.startLine - 1, end: slide.endLine }));

  if (!ranges.length) return text;

  const selectedLine = (index) => ranges.some((range) => index >= range.start && index < range.end);
  const movedLines = ranges.flatMap((range) => lines.slice(range.start, range.end));
  const keptLines = [];
  let insertAt = null;

  lines.forEach((line, index) => {
    if (target && index === target.startLine - 1) insertAt = keptLines.length;
    if (!selectedLine(index)) keptLines.push(line);
  });

  keptLines.splice(insertAt ?? keptLines.length, 0, ...movedLines);
  return keptLines.join("\n").replace(/\n{4,}/g, "\n\n\n");
}

function renameSlide(text, slides, slideId, value) {
  const slide = slides.find((item) => item.id === slideId);
  if (!slide) return text;

  const lines = text.split(/\r?\n/);
  const lineIndex = slide.headingLine - 1;
  const trimmed = value.trim();

  // Full heading line (lets the user change level # vs ##, edit attributes, etc.).
  if (/^#{1,6}\s/.test(trimmed)) {
    lines[lineIndex] = trimmed;
    return lines.join("\n");
  }

  // Title-only input — preserve the original level and trailing attribute block.
  const original = lines[lineIndex];
  const attrMatch = original.match(/\s*(\{[^}]*\})\s*$/);
  const attr = attrMatch ? ` ${attrMatch[1]}` : "";
  const hashes = "#".repeat(slide.level);
  lines[lineIndex] = trimmed ? `${hashes} ${trimmed}${attr}` : `${hashes}${attr}`;
  return lines.join("\n");
}

function parseHeadingTitle(rawHeading) {
  const attrMatch = rawHeading.match(/\s*(\{[^}]*\})\s*$/);
  const attr = attrMatch ? attrMatch[1] : "";
  const withoutAttr = attr ? rawHeading.slice(0, rawHeading.length - attr.length).trim() : rawHeading.trim();
  const title = withoutAttr
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\{[^}]+\}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();

  return {
    title,
    attr,
    classes: attr ? Array.from(attr.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1]) : []
  };
}

function setHeadingClass(line, className, enabled) {
  const attrMatch = line.match(/\s*(\{[^}]*\})\s*$/);

  if (!attrMatch) {
    return enabled ? `${line.trimEnd()} {.${className}}` : line;
  }

  const attr = attrMatch[1];
  const body = line.slice(0, line.length - attr.length).trimEnd();
  const classes = Array.from(new Set(Array.from(attr.matchAll(/\.([A-Za-z0-9_-]+)/g)).map((match) => match[1])));
  const otherAttrs = attr
    .slice(1, -1)
    .split(/\s+/)
    .filter((part) => part && !part.startsWith("."));

  const nextClasses = enabled ? Array.from(new Set([...classes, className])) : classes.filter((item) => item !== className);
  const nextAttr = [...otherAttrs, ...nextClasses.map((item) => `.${item}`)].join(" ");

  return nextAttr ? `${body} {${nextAttr}}` : body;
}

// Paths listed under `css:` in a deck's YAML front matter, in order. Handles
// both the inline form (`css: x.css`) and the list form (`css:` then `- a.css`).
// Quotes are stripped. Shared by the preview-background and style-copy helpers.
export function extractCssPaths(qmdSource) {
  const match = qmdSource.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const lines = match[1].split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*css:/.test(l));
  if (idx === -1) return [];
  const baseIndent = lines[idx].match(/^(\s*)/)[1].length;
  const stripQuotes = (s) => s.replace(/^['"]|['"]$/g, "");
  const inline = lines[idx].replace(/^\s*css:\s*/, "").trim();
  if (inline) return [stripQuotes(inline)];
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (lines[i].match(/^(\s*)/)[1].length <= baseIndent) break;
    const item = lines[i].match(/^\s*-\s*(.*)$/);
    if (!item) break;
    out.push(stripQuotes(item[1].trim()));
  }
  return out;
}
