import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { basicSetup } from "codemirror";
import { autocompletion, snippet, snippetCompletion, startCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, Prec, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin } from "@codemirror/view";

// Like snippetCompletion, but after expanding the snippet it opens the
// completion menu at the cursor. Used for snippets whose first field is an empty
// class slot (the `${1}` right after the dot in `{.}`), so the class picker
// appears immediately and the user picks a real style instead of typing over a
// dummy "class" word.
function classSnippet(template, info) {
  const apply = snippet(template);
  return {
    ...info,
    apply: (view, completion, from, to) => {
      apply(view, completion, from, to);
      startCompletion(view);
    }
  };
}

// Slash commands: type "/" at the start of a line (or after a space) to open a
// menu that inserts common Quarto/Reveal structures. Snippet `${name}` fields
// are tab-navigable placeholders; `${}` is where the cursor lands at the end.
// `boost` keeps the everyday structures (columns, span, div) at the top of the
// menu, ahead of the occasional ones (fragment, notes).
// Typing "/" while text is selected wraps the selection instead (see
// wrapSelectionOnSlash), so /span here is for the empty-cursor case.
const SLASH_COMMANDS = [
  snippetCompletion(
    ':::: {.columns}\n\n::: {.column width="50%"}\n${left}\n:::\n\n::: {.column width="50%"}\n${right}\n:::\n\n::::\n\n${}',
    { label: "/columns", detail: "two columns (50/50)", type: "keyword", boost: 99 }
  ),
  snippetCompletion(
    '::: {.column width="${1:50}%"}\n\n${content}\n\n:::\n\n${}',
    { label: "/column", detail: "single column block", type: "keyword", boost: 98 }
  ),
  classSnippet(
    "[${2:text}]{.${1}}${}",
    { label: "/span", detail: "inline span [text]{.class}", type: "keyword", boost: 97 }
  ),
  classSnippet(
    "::: {.${1}}\n\n${2:content}\n\n:::\n\n${}",
    { label: "/div", detail: "fenced div with class", type: "keyword", boost: 96 }
  ),
  snippetCompletion(
    "::: {.cards}\n\n- **${1:Title}** ${2:body}\n- **${3:Title}** ${4:body}\n\n:::\n\n${}",
    { label: "/cards", detail: "grid of cards (one per list item)", type: "keyword", boost: 92 }
  ),
  snippetCompletion(
    "::: {.card}\n\n${1:content}\n\n:::\n\n${}",
    { label: "/card", detail: "one card (add a colour to tint it)", type: "keyword", boost: 91 }
  ),
  snippetCompletion(
    '::: {.place style="top:${1:50}%; left:${2:50}%"}\n\n${3:content}\n\n:::\n\n${}',
    { label: "/place", detail: "float a block anywhere (top/left %)", type: "keyword", boost: 51 }
  ),
  // Component + colour: inserts the component class then opens the picker for
  // the colour (you then add .light/.dark or .cascade-2 by typing another `.`).
  classSnippet(
    "::: {.panel .${1}}\n\n${2:content}\n\n:::\n\n${}",
    { label: "/panel", detail: "panel box, then pick a colour", type: "keyword", boost: 94 }
  ),
  classSnippet(
    "[${2:text}]{.hl .${1}}${}",
    { label: "/highlight", detail: "static highlight, then pick a colour", type: "keyword", boost: 93 }
  ),
  classSnippet(
    "[${2:text}]{.flare .${1}}${}",
    { label: "/flare", detail: "animated highlight, then pick a colour", type: "keyword", boost: 93 }
  ),
  snippetCompletion(
    ':::: {.columns}\n\n::: {.column width="33%"}\n${one}\n:::\n\n::: {.column width="33%"}\n${two}\n:::\n\n::: {.column width="33%"}\n${three}\n:::\n\n::::\n\n${}',
    { label: "/columns3", detail: "three columns (33%)", type: "keyword", boost: 50 }
  ),
  snippetCompletion(
    "::: {.fragment}\n\n${content}\n\n:::\n\n${}",
    { label: "/fragment", detail: "reveal one step at a time", type: "keyword", boost: 49 }
  ),
  snippetCompletion(
    "::: {.incremental}\n\n${- first\n- second}\n\n:::\n\n${}",
    { label: "/incremental", detail: "reveal list items one at a time", type: "keyword", boost: 48 }
  ),
  snippetCompletion(
    "::: {.notes}\n\n${Speaker note}\n\n:::\n\n${}",
    { label: "/notes", detail: "speaker notes (press S in the deck)", type: "keyword", boost: 48 }
  ),
  // Not a snippet: removes the fenced div around the cursor (opener + matching
  // closer), keeping the content. Works with the cursor on the opening line or
  // anywhere inside the block. See unwrapDivAtCursor.
  {
    label: "/unwrap",
    detail: "remove the surrounding div, keep its content",
    type: "keyword",
    boost: 46,
    apply: (view, _completion, from, to) => unwrapDivAtCursor(view, from, to)
  }
];

// `/image` is not a snippet: its apply removes the typed `/image` and calls back
// into the app to open the picture gallery (the same flow as the Image button),
// which then inserts the chosen image at the cursor. `getOnImage` returns that
// callback so this stays current without remounting the editor.
function makeSlashCompletions(getOnImage) {
  const imageCommand = {
    label: "/image",
    detail: "insert a picture (opens the gallery)",
    type: "keyword",
    boost: 95,
    apply: (view, _completion, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
      const open = getOnImage();
      if (open) setTimeout(open, 0); // let the completion close before the modal opens
    }
  };
  const options = [...SLASH_COMMANDS, imageCommand];
  return function slashCompletions(context) {
    const match = context.matchBefore(/\/[\w-]*$/);
    if (!match) return null;
    // Only trigger at line start or after whitespace, so URLs (http://) don't.
    if (match.from > 0 && !/\s/.test(context.state.sliceDoc(match.from - 1, match.from))) return null;
    return { from: match.from, options, validFor: /^\/[\w-]*$/ };
  };
}

// inputHandler: when the user types "/" over a selection, wrap it and open the
// class picker so they just choose a style. A selection inside one line becomes
// an inline span `[selection]{.}`; a selection spanning several lines is rounded
// out to whole lines and wrapped in a fenced div (`::: {.}` ... `:::`), so it is
// always balanced. With no selection (from === to) return false, so "/" types
// normally and the slash-command menu opens.
function wrapSelectionOnSlash(view, from, to, text) {
  if (text !== "/" || from === to) return false;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  if (startLine.number !== endLine.number) {
    // Multi-line: wrap the whole line range in a fenced div, cursor after the dot.
    const body = view.state.sliceDoc(startLine.from, endLine.to);
    const insert = `::: {.}\n${body}\n:::`;
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert },
      selection: { anchor: startLine.from + "::: {.".length } // between "." and "}"
    });
    startCompletion(view);
    return true;
  }

  const selected = view.state.sliceDoc(from, to);
  const insert = `[${selected}]{.}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length - 1 } // between "." and "}"
  });
  startCompletion(view);
  return true;
}

// Detect Pandoc fenced-div lines (three or more colons). An opener carries
// content after the colons (`::: {.foo}` or `::: foo`); a closer is bare colons.
const isOpenFence = (t) => /^\s*:{3,}\s*\S/.test(t);
const isCloseFence = (t) => /^\s*:{3,}\s*$/.test(t);

// Find the innermost fenced div whose line range contains `lineNumber`. Pairs
// openers to closers with a stack, so nesting (and same-colon-count nesting,
// which Pandoc allows) resolves correctly. Returns { open, close } line numbers.
function findEnclosingDiv(doc, lineNumber) {
  const stack = [];
  let best = null;
  for (let n = 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (isCloseFence(t)) {
      const open = stack.pop();
      if (open != null && open <= lineNumber && lineNumber <= n && (!best || open > best.open)) {
        best = { open, close: n };
      }
    } else if (isOpenFence(t)) {
      stack.push(n);
    }
  }
  return best;
}

// Slash command: remove the fenced div surrounding the cursor, keeping its
// content. Strips the typed trigger first, then deletes the opening fence line
// and its matching closing fence line.
function unwrapDivAtCursor(view, from, to) {
  view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(from).number;
  const div = findEnclosingDiv(doc, cursorLine);
  if (!div) return;
  const openLine = doc.line(div.open);
  const closeLine = doc.line(div.close);
  // Delete each fence line plus its trailing newline; closer first to keep
  // the opener's offsets valid.
  const lineSpan = (ln) => ({
    from: ln.from,
    to: ln.number < doc.lines ? doc.line(ln.number + 1).from : ln.to
  });
  view.dispatch({ changes: [lineSpan(closeLine), lineSpan(openLine)].map((s) => ({ ...s, insert: "" })) });
}

// Which classes make sense on an INLINE span (`[text]{.}`) rather than a block.
// Block classes (panel, cards, columns, fragment, ...) are noise inside a span,
// so we hide them there. This is an allowlist of the inline families we use; a
// class not listed still works if typed by hand, it just is not suggested inline.
// Add new inline classes here.
const INLINE_PREFIXES = ["cascade-", "hl-", "flare-", "chip-", "emph-", "arrow-", "stat"];
const INLINE_EXACT = new Set([
  // components usable inline
  "flare", "hl", "chip",
  // colours (shared inline and block) and shades
  "blue", "cyan", "teal", "grey", "yellow", "pink", "green", "mint", "navy", "mag", "light", "dark",
  // misc inline
  "accent", "verdict", "term", "gloss", "note-inline", "caption", "ref", "sep", "dot"
]);
const isInlineClass = (name) =>
  INLINE_EXACT.has(name) || INLINE_PREFIXES.some((p) => name.startsWith(p));

// FontAwesome classes (`fa-solid`, `fa-2x`, `fa-feather`, ... and the style
// bases) come from all.min.css and belong in `<i class="...">`, not in a `{.}`
// attribute. Hide them from the picker. Icon sizing is done with `.scale-*`.
const FA_BASES = new Set(["fa", "fas", "far", "fab", "fal", "fat", "fad", "fass", "fasr"]);
const isFontAwesomeClass = (name) => name.startsWith("fa-") || FA_BASES.has(name);

// Offer the deck's real CSS classes when the cursor is just after a "." inside a
// Pandoc attribute block, e.g. `::: {.|}`, `[text]{.|}`, `## Title {.|}`.
// `getClasses` returns the current [{ name, shared }] list (fetched per deck).
// In an inline span the list is narrowed to inline-appropriate classes; in a
// fenced div or heading attribute the full list is offered.
function makeClassCompletions(getClasses) {
  return function classCompletions(context) {
    const list = getClasses();
    if (!list || !list.length) return null;
    const match = context.matchBefore(/\.[\w-]*$/);
    if (!match) return null;
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    // Inside an open attribute block only: last "{" must come after last "}".
    const openBrace = before.lastIndexOf("{");
    if (openBrace <= before.lastIndexOf("}")) return null;
    // Drop FontAwesome noise everywhere; then, in an inline span, narrow to
    // inline-appropriate classes. Fences/headings get the full (non-FA) list.
    const usable = list.filter((c) => !isFontAwesomeClass(c.name));
    const inline = openBrace > 0 && before[openBrace - 1] === "]";
    const options = (inline ? usable.filter((c) => isInlineClass(c.name)) : usable)
      .map((c) => ({ label: c.name, type: "class", detail: c.shared ? "shared" : "deck" }));
    return {
      from: match.from + 1, // keep the "."; complete the name after it
      options,
      validFor: /^[\w-]*$/
    };
  };
}

// Visual aid: tint the lines of a Quarto columns block so the structure is
// scannable in plain text. The two columns alternate tints; the surrounding
// `.columns` container gets a neutral left bar. `@codemirror/lang-markdown`
// doesn't parse Pandoc fenced divs, so we scan lines: a fence opens with colons
// followed by content (`::: {.column}` or `::: foo`) and closes with bare colons.
const columnsDeco = Decoration.line({ class: "cm-columns-block" });
const colADeco = Decoration.line({ class: "cm-col-a" });
const colBDeco = Decoration.line({ class: "cm-col-b" });

function fenceClasses(text) {
  const rest = /^\s*:{3,}\s*(.*)$/.exec(text)?.[1] ?? "";
  const braced = /\{([^}]*)\}/.exec(rest);
  if (braced) return [...braced[1].matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  const word = rest.trim().split(/\s+/)[0]; // Pandoc allows `::: foo` for class foo
  return word ? [word] : [];
}

function buildColumnDecos(view) {
  const builder = new RangeSetBuilder();
  const { doc } = view.state;
  const stack = []; // open fences; each carries the tint `kind` it applies
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const isClose = /^\s*:{3,}\s*$/.test(line.text);
    const isOpen = !isClose && /^\s*:{3,}\s*\S/.test(line.text);
    let kind;
    if (isClose) {
      kind = stack.pop()?.kind;
    } else if (isOpen) {
      const cls = fenceClasses(line.text);
      const parent = stack[stack.length - 1];
      let entry;
      if (cls.includes("columns")) entry = { kind: "columns", cols: 0 };
      else if (cls.includes("column") && parent?.kind === "columns") entry = { kind: parent.cols++ % 2 === 0 ? "colA" : "colB" };
      else entry = { kind: parent?.kind }; // nested div keeps the column's tint
      stack.push(entry);
      kind = entry.kind;
    } else {
      kind = stack[stack.length - 1]?.kind;
    }
    const deco = kind === "colA" ? colADeco : kind === "colB" ? colBDeco : kind === "columns" ? columnsDeco : null;
    if (deco) builder.add(line.from, line.from, deco);
  }
  return builder.finish();
}

const columnTint = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildColumnDecos(view); }
    update(u) { if (u.docChanged) this.decorations = buildColumnDecos(u.view); }
  },
  { decorations: (v) => v.decorations }
);

// Obsidian-style inline formatting. Each command toggles a marker pair around
// every selection range: wrap a selection, toggle it back off if already
// wrapped (markers just outside the selection, or included in it), or drop an
// empty pair with the cursor between the markers when there is no selection.
// `changeByRange` maps each range's new position through the other ranges'
// edits, so this stays correct under multi-cursor.
function toggleWrap(open, close = open) {
  return (view) => {
    const tr = view.state.changeByRange((range) => {
      const { from, to } = range;
      const selected = view.state.sliceDoc(from, to);
      const before = view.state.sliceDoc(Math.max(0, from - open.length), from);
      const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + close.length));
      // Markers sit just outside the selection: strip them.
      if (before === open && after === close) {
        return {
          changes: [
            { from: from - open.length, to: from, insert: "" },
            { from: to, to: to + close.length, insert: "" }
          ],
          range: EditorSelection.range(from - open.length, to - open.length)
        };
      }
      // Markers are inside the selection: strip them.
      if (from !== to && selected.length >= open.length + close.length &&
          selected.startsWith(open) && selected.endsWith(close)) {
        const inner = selected.slice(open.length, selected.length - close.length);
        return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, from + inner.length) };
      }
      // Empty cursor: drop the pair and land between the markers.
      if (from === to) {
        return { changes: { from, insert: open + close }, range: EditorSelection.cursor(from + open.length) };
      }
      // Wrap the selection, keeping the inner text selected.
      return {
        changes: [{ from, insert: open }, { from: to, insert: close }],
        range: EditorSelection.range(from + open.length, to + open.length)
      };
    });
    view.dispatch(tr, { userEvent: "input", scrollIntoView: true });
    return true;
  };
}

// Link: wrap the selection as `[text](url)` with the cursor in the empty URL,
// or insert `[]()` with the cursor in the text slot when nothing is selected.
function insertLink(view) {
  const tr = view.state.changeByRange((range) => {
    const { from, to } = range;
    if (from === to) {
      return { changes: { from, insert: "[]()" }, range: EditorSelection.cursor(from + 1) };
    }
    const insert = `[${view.state.sliceDoc(from, to)}]()`;
    return { changes: { from, to, insert }, range: EditorSelection.cursor(from + insert.length - 1) };
  });
  view.dispatch(tr, { userEvent: "input", scrollIntoView: true });
  return true;
}

// Obsidian-like markdown formatting shortcuts. Prec.high so they beat any
// default binding for the same key.
const formattingKeymap = Prec.high(keymap.of([
  { key: "Mod-b", preventDefault: true, run: toggleWrap("**") },
  { key: "Mod-i", preventDefault: true, run: toggleWrap("*") },
  { key: "Mod-`", preventDefault: true, run: toggleWrap("`") },
  { key: "Mod-Shift-x", preventDefault: true, run: toggleWrap("~~") },
  // Highlight uses the deck's own span class (yellow is the default highlighter);
  // for the other fills use the / slash menu and pick hl-blue/pink/green.
  { key: "Mod-Shift-h", preventDefault: true, run: toggleWrap("[", "]{.hl-yellow}") },
  { key: "Mod-k", preventDefault: true, run: insertLink }
]));

// Uncontrolled CodeMirror: mount once with `initialValue`, stream changes via onChange.
// Caller remounts (via `key` prop) when it wants a different document.
// `basicSetup` brings the standard keymap (defaultKeymap, history, search,
// fold, completion, lint, closeBrackets) plus multi-cursor, rectangular
// selection, highlight-active-line, etc. `indentWithTab` makes Tab indent.
// `onImagePaste(file)` — if supplied, called when the user pastes an image
// from the clipboard; should resolve to a string (e.g. `![](img/x.png)`)
// which we insert at the cursor.
export const Editor = forwardRef(function Editor({ initialValue = "", onChange, onImagePaste, onRender, onImageCommand, classes = [] }, ref) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onImagePasteRef = useRef(onImagePaste);
  const onRenderRef = useRef(onRender);
  const onImageCommandRef = useRef(onImageCommand);
  // Read inside the (mount-once) completion source so the class list stays
  // current as decks load without remounting the editor.
  const classesRef = useRef(classes);
  onChangeRef.current = onChange;
  onImagePasteRef.current = onImagePaste;
  onRenderRef.current = onRender;
  onImageCommandRef.current = onImageCommand;
  classesRef.current = classes;

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch(view.state.replaceSelection(text));
      view.focus();
    }
  }), []);

  useEffect(() => {
    if (!hostRef.current) return;

    const pasteHandler = EditorView.domEventHandlers({
      paste(event, view) {
        const handler = onImagePasteRef.current;
        if (!handler) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
          const file = item.getAsFile();
          if (!file) continue;
          event.preventDefault();
          Promise.resolve(handler(file))
            .then((insertion) => {
              if (!insertion) return;
              view.dispatch(view.state.replaceSelection(insertion));
            })
            .catch((err) => console.error("image paste failed", err));
          return true;
        }
        return false;
      }
    });

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          // `override` makes these the ONLY completion sources, so the nearby-word
          // popups that are noise in prose never appear. Each source returns
          // nothing except in its trigger context ("/..." for commands, ".x"
          // inside {} for classes), so activateOnTyping is safe: those open the
          // menu, ordinary prose stays quiet.
          autocompletion({
            activateOnTyping: true,
            override: [makeSlashCompletions(() => onImageCommandRef.current), makeClassCompletions(() => classesRef.current)]
          }),
          // Ctrl/Cmd+Enter renders the deck. Prec.highest beats the default
          // keymap's Mod-Enter (insertBlankLine) so it wins inside the editor.
          Prec.highest(keymap.of([{
            key: "Mod-Enter",
            preventDefault: true,
            run: () => { onRenderRef.current?.(); return true; }
          }])),
          formattingKeymap,
          // Typing "/" over a selection wraps it as a styled span; with no
          // selection this returns false so "/" types through to the slash menu.
          EditorView.inputHandler.of(wrapSelectionOnSlash),
          keymap.of([indentWithTab]),
          markdown(),
          columnTint,
          EditorView.lineWrapping,
          pasteHandler,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          })
        ]
      })
    });

    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  return <div ref={hostRef} className="editor-shell" />;
});
