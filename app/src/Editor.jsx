import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { basicSetup } from "codemirror";
import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

// Uncontrolled CodeMirror: mount once with `initialValue`, stream changes via onChange.
// Caller remounts (via `key` prop) when it wants a different document.
// `basicSetup` brings the standard keymap (defaultKeymap, history, search,
// fold, completion, lint, closeBrackets) plus multi-cursor, rectangular
// selection, highlight-active-line, etc. `indentWithTab` makes Tab indent.
// `onImagePaste(file)` — if supplied, called when the user pastes an image
// from the clipboard; should resolve to a string (e.g. `![](img/x.png)`)
// which we insert at the cursor.
export const Editor = forwardRef(function Editor({ initialValue = "", onChange, onImagePaste, onRender }, ref) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onImagePasteRef = useRef(onImagePaste);
  const onRenderRef = useRef(onRender);
  onChangeRef.current = onChange;
  onImagePasteRef.current = onImagePaste;
  onRenderRef.current = onRender;

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
          // Replace basicSetup's autocompletion with a manual-only one. For
          // prose markdown, the popups suggesting nearby words are noise.
          // Ctrl-Space still opens it on demand.
          autocompletion({ activateOnTyping: false }),
          // Ctrl/Cmd+Enter renders the deck. Prec.highest beats the default
          // keymap's Mod-Enter (insertBlankLine) so it wins inside the editor.
          Prec.highest(keymap.of([{
            key: "Mod-Enter",
            preventDefault: true,
            run: () => { onRenderRef.current?.(); return true; }
          }])),
          keymap.of([indentWithTab]),
          markdown(),
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
