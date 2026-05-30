import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseQmd } from "../server/parser.js";

import { api } from "./api.js";
import { Editor } from "./Editor.jsx";
import { Gallery } from "./Gallery.jsx";
import { Icon } from "./Icons.jsx";
import { ImageGallery } from "./ImageGallery.jsx";
import { PreviewFrame } from "./PreviewFrame.jsx";
import { SlideList } from "./SlideList.jsx";

const CLIPBOARD_KEY = "local-slide-app.clipboard";
const PREVIEW_WIDTH_KEY = "local-slide-app.preview-width";
const SLIDELIST_HEIGHT_KEY = "local-slide-app.slidelist-height";
const RAIL_HIDDEN_KEY = "local-slide-app.rail-hidden";
const RAIL_WIDTH_KEY = "local-slide-app.rail-width";
const PREVIEW_WIDTH_DEFAULT = 640;
const PREVIEW_WIDTH_MIN = 320;
const MIDDLE_WIDTH_MIN = 170;
const SLIDELIST_HEIGHT_DEFAULT = 280;
const SLIDELIST_HEIGHT_MIN = 120;
const EDITOR_HEIGHT_MIN = 160;
const RAIL_WIDTH_DEFAULT = 280;
const RAIL_WIDTH_MIN = 180;
const RAIL_WIDTH_MAX = 500;

export function App() {
  const [decks, setDecks] = useState([]);
  const [activeDeck, setActiveDeck] = useState("");
  const [source, setSource] = useState("");
  const [slides, setSlides] = useState([]);
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [checkedSlideIds, setCheckedSlideIds] = useState([]);
  const [clipboard, setClipboard] = useState(() => readClipboard());
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [building, setBuilding] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(() => readPreviewWidth());
  const [slideListHeight, setSlideListHeight] = useState(() => readSlideListHeight());
  const [railWidth, setRailWidth] = useState(() => readRailWidth());
  const [railHidden, setRailHidden] = useState(() => localStorage.getItem(RAIL_HIDDEN_KEY) === "1");
  const [editorMode, setEditorMode] = useState("slides"); // "slides" | "whole"
  const [helpOpen, setHelpOpen] = useState(false);
  const [galleryAfter, setGalleryAfter] = useState(null); // slideId after which to insert
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  // Bumps after any structural change (rename, slide actions, mode switch). Used
  // in the Editor's `key` so it remounts and re-extracts its initialValue from
  // the latest source. Typing alone does NOT bump it — that would steal focus.
  const [structureVersion, setStructureVersion] = useState(0);

  const sourceRef = useRef("");
  const lastSavedSourceRef = useRef("");
  const selectedSlideIdRef = useRef("");
  // The selected slide with line offsets valid for the CURRENT in-memory source.
  // Kept fresh on every edit (see onBodyChange) so splicing never drifts.
  const currentSlideRef = useRef(null);
  const renderingRef = useRef(false);
  const editorRef = useRef(null);

  sourceRef.current = source;
  selectedSlideIdRef.current = selectedSlideId;

  useEffect(() => { refreshDecks(readDeckFromHash()).catch(showError); }, []);

  useEffect(() => {
    writeDeckToHash(activeDeck);
  }, [activeDeck]);

  useEffect(() => {
    const onHashChange = () => {
      const fromHash = readDeckFromHash();
      if (fromHash && fromHash !== activeDeck) setActiveDeck(fromHash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [activeDeck]);

  useEffect(() => {
    if (!activeDeck) return;
    // Wipe deck-scoped state BEFORE loadSource resolves. If we leave the old
    // `slides` in place, the auto-pick effect fires with stale data, sets
    // selectedSlideId back to "slide-1" of the OLD deck, the Editor mounts
    // with the old body, and when the new slides arrive the Editor key
    // (deck-N-slide-1-V) doesn't change so React reuses the instance and the
    // wrong body sticks.
    setDirty(false);
    setSelectedSlideId("");
    setCheckedSlideIds([]);
    setSlides([]);
    setSource("");
    setStructureVersion((v) => v + 1);
    loadSource(activeDeck).catch(showError);
  }, [activeDeck]);

  // Auto-pick the first slide once slides arrive.
  useEffect(() => {
    if (selectedSlideId || !slides.length) return;
    setSelectedSlideId(slides[0].id);
  }, [slides, selectedSlideId]);

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) || null,
    [slides, selectedSlideId]
  );

  // Seed the live splice offsets from the parsed slide whenever selection or the
  // parse (load / render / structural action / dirty re-parse) changes. During a
  // typing burst neither dep changes, so onBodyChange's deterministic updates are
  // not clobbered.
  useEffect(() => {
    currentSlideRef.current = slides.find((slide) => slide.id === selectedSlideId) || null;
  }, [slides, selectedSlideId]);

  const activeDeckMeta = decks.find((deck) => deck.id === activeDeck);

  async function refreshDecks(preferredDeckId = "") {
    const items = await api("/api/decks");
    setDecks(items);
    const nextDeck = preferredDeckId || activeDeck || items[0]?.id || "";
    setActiveDeck(items.some((deck) => deck.id === nextDeck) ? nextDeck : items[0]?.id || "");
  }

  async function loadSource(deckId) {
    const data = await api(`/api/decks/${deckId}/source`);
    lastSavedSourceRef.current = data.source;
    setSource(data.source);
    setSlides(data.parsed.slides);
    setMessage(`${data.deck.title} · ${data.parsed.slides.length} slides`);
  }

  // Write the in-memory source to disk. The .qmd is what Quarto's preview
  // watches, so writing is what triggers the right-hand render. Edits stay in
  // memory until the user asks for a render (Render button / Ctrl+Enter), so
  // typing no longer reloads the preview on every keystroke.
  async function render(doneMessage = "Rendered") {
    if (!activeDeck) return;
    const sent = sourceRef.current;
    if (sent === lastSavedSourceRef.current) {
      setDirty(false);
      return;
    }
    if (renderingRef.current) return; // a write is already in flight
    renderingRef.current = true;
    try {
      const data = await api(`/api/decks/${activeDeck}/source`, {
        method: "PUT",
        body: JSON.stringify({ source: sent })
      });
      lastSavedSourceRef.current = sent;
      const stillDirty = sourceRef.current !== sent;
      // Keep the rail in sync with whatever is now in memory: the server's parse
      // of what we wrote, or a fresh parse if the user typed during the request.
      setSlides(stillDirty ? parseQmd(sourceRef.current).slides : data.parsed.slides);
      setDirty(stillDirty);
      setMessage(stillDirty ? "Rendered (more edits pending)" : doneMessage);
    } catch (error) {
      showError(error);
    } finally {
      renderingRef.current = false;
    }
  }

  function onBodyChange(nextBody) {
    const slide = currentSlideRef.current;
    if (!slide) return;
    const { text, endLine } = spliceBody(sourceRef.current, slide, nextBody);
    sourceRef.current = text; // sync now so a fast follow-up keystroke chains correctly
    setSource(text);
    // The body now occupies a known range, so we can advance endLine without a
    // re-parse. This keeps the next splice correct even across many line-adds and,
    // unlike re-parsing, never snaps the boundary onto a heading typed in the body.
    currentSlideRef.current = { ...slide, endLine };
    setDirty(true);
  }

  function onSelectSlide(slideId) {
    // Edits already live in `source`, so switching is a pure in-memory move with
    // no write and no preview reload. If there are pending edits, re-parse the
    // in-memory source first so every slide's line offsets match it.
    if (dirty) setSlides(parseQmd(sourceRef.current).slides);
    setSelectedSlideId(slideId);
  }

  function onToggleCheck(slideId) {
    setCheckedSlideIds((current) =>
      current.includes(slideId)
        ? current.filter((id) => id !== slideId)
        : [...current, slideId]
    );
  }

  function onExtendCheck(ids) {
    setCheckedSlideIds((current) => {
      const set = new Set(current);
      for (const id of ids) set.add(id);
      return Array.from(set);
    });
  }

  function onWholeFileChange(next) {
    sourceRef.current = next;
    setSource(next);
    setDirty(true); // the rail re-parses on render or when leaving whole-file mode
  }

  async function onImagePaste(file) {
    if (!activeDeck) return "";
    const buffer = await file.arrayBuffer();
    const response = await fetch(`/api/decks/${encodeURIComponent(activeDeck)}/images`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Upload failed (${response.status})`);
    }
    const data = await response.json();
    setMessage(`Saved ${data.filename}`);
    return `![](${data.path}){width="20%"}`;
  }

  // Insert a gallery image at the editor cursor, referenced relative to the
  // active deck folder. All decks (and _shared) are single-level under the repo
  // root, so `../<repoPath>` reaches anything; same-deck images use a bare path.
  function insertGalleryImage(image) {
    const folder = activeDeckMeta?.folder;
    const segments = image.path.split("/");
    const rel = folder && segments[0] === folder
      ? segments.slice(1).join("/")
      : `../${image.path}`;
    editorRef.current?.insertAtCursor(`![](${rel}){width="20%"}`);
    setMessage(`Inserted ${image.filename}`);
  }

  function switchEditorMode(mode) {
    if (mode === editorMode) return;
    // Both modes read the same in-memory `source`, so no write is needed. Re-parse
    // pending edits (e.g. whole-file changes) so the slides view gets fresh offsets.
    if (dirty) setSlides(parseQmd(sourceRef.current).slides);
    setStructureVersion((v) => v + 1);
    setEditorMode(mode);
  }

  async function switchToDeck(deckId) {
    if (deckId === activeDeck) return;
    // Persist pending edits before leaving. This writes (and renders) the deck
    // we are leaving, but its preview is about to unmount so nothing flickers.
    if (dirty) await render("Rendered");
    setActiveDeck(deckId);
  }

  async function onSlideAction(action) {
    if (!activeDeck) return;

    if (action.type === "gallery-open") {
      setGalleryAfter(action.afterSlideId ?? selectedSlideIdRef.current ?? null);
      return;
    }

    // Structural actions run server-side on the current in-memory source, so
    // pending typing is included without a separate write first.
    if (action.type === "copy") {
      const data = await api(`/api/decks/${activeDeck}/slides/copy`, {
        method: "POST",
        body: JSON.stringify({ slideIds: action.slideIds, source: sourceRef.current })
      }).catch(showError);
      if (!data) return;
      setClipboard(data.blocks);
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data.blocks));
      setMessage(`${data.blocks.length} slide(s) copied`);
      return;
    }

    const payload = action.type === "paste"
      ? { ...action, type: "paste", afterSlideId: action.afterSlideId ?? selectedSlideIdRef.current, blocks: action.blocks ?? clipboard }
      : action.type === "new"
      ? { ...action, type: "new", afterSlideId: action.afterSlideId ?? selectedSlideIdRef.current }
      : action;

    // Applying writes the new source to disk, which persists pending edits and
    // renders, so the deck is no longer dirty afterwards.
    const data = await api(`/api/decks/${activeDeck}/slides/apply`, {
      method: "POST",
      body: JSON.stringify({ ...payload, source: sourceRef.current })
    }).catch(showError);
    if (!data) return;

    lastSavedSourceRef.current = data.source;
    setSource(data.source);
    setSlides(data.parsed.slides);
    setCheckedSlideIds([]);
    setDirty(false);
    setStructureVersion((v) => v + 1);

    let note = `${labelFor(action.type)} applied`;
    const s = data.stylesAdded;
    if (s?.added?.length || s?.replaced?.length) {
      const parts = [];
      if (s.added?.length) parts.push(`added ${s.added.length}`);
      if (s.replaced?.length) parts.push(`overrode ${s.replaced.length}`);
      const vAdd = s.vars?.length || 0;
      const vRep = s.varsReplaced?.length || 0;
      if (vAdd || vRep) {
        const vParts = [];
        if (vAdd) vParts.push(`+${vAdd}`);
        if (vRep) vParts.push(`~${vRep}`);
        parts.push(`vars ${vParts.join("/")}`);
      }
      note += ` · ${parts.join(", ")} in ${s.file}`;
    } else if (s?.reason) {
      note += ` · styles not copied (${s.reason})`;
    }
    setMessage(note);

    // For inserts (new / duplicate), jump selection to the freshly created slide.
    if (action.type === "new") {
      const afterId = action.afterSlideId ?? selectedSlideIdRef.current;
      const after = slides.find((slide) => slide.id === afterId);
      const created = after ? data.parsed.slides[after.index + 1] : data.parsed.slides[0];
      if (created) { setSelectedSlideId(created.id); return; }
    }
    if (action.type === "duplicate") {
      const src = slides.find((slide) => slide.id === action.slideId);
      const duplicated = src ? data.parsed.slides[src.index + 1] : null;
      if (duplicated) { setSelectedSlideId(duplicated.id); return; }
    }
    // Gallery paste: jump to the inserted slide (sits right after afterSlideId).
    if (action.type === "paste" && action.sourceDeckId) {
      const after = slides.find((slide) => slide.id === action.afterSlideId);
      const inserted = after ? data.parsed.slides[after.index + 1] : data.parsed.slides[0];
      if (inserted) { setSelectedSlideId(inserted.id); return; }
    }
    // Try to keep selection on the same slide by matching previous heading line.
    const previous = slides.find((slide) => slide.id === selectedSlideIdRef.current);
    if (!previous) {
      setSelectedSlideId(data.parsed.slides[0]?.id || "");
      return;
    }
    const match = data.parsed.slides.find((slide) => slide.title === previous.title)
      || data.parsed.slides[Math.min(previous.index, data.parsed.slides.length - 1)];
    setSelectedSlideId(match?.id || "");
  }

  async function onRename(slideId, title) {
    const data = await api(`/api/decks/${activeDeck}/slides/apply`, {
      method: "POST",
      body: JSON.stringify({ type: "rename", slideId, title, source: sourceRef.current })
    }).catch(showError);
    if (!data) return;
    lastSavedSourceRef.current = data.source;
    setSource(data.source);
    setSlides(data.parsed.slides);
    setDirty(false);
    setStructureVersion((v) => v + 1);
    // Selection survives by id since rename doesn't reorder.
    setMessage(`Renamed to "${title}"`);
  }

  async function createProject() {
    const title = window.prompt("New project title");
    if (!title) return;
    const deck = await api("/api/decks", {
      method: "POST",
      body: JSON.stringify({ title })
    }).catch(showError);
    if (!deck) return;
    await refreshDecks(deck.id);
    setMessage(`Created ${deck.title}`);
  }

  async function cloneProject(deck) {
    const target = deck || activeDeckMeta;
    if (!target) return;
    const title = window.prompt("Title for the clone", `${target.title} copy`);
    if (title === null) return;
    const result = await api(`/api/decks/${target.id}/clone`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim() })
    }).catch(showError);
    if (!result) return;
    await refreshDecks(result.id);
    setMessage(`Cloned to ${result.folder}`);
  }

  async function renameProject(deck) {
    const target = deck || activeDeckMeta;
    if (!target) return;
    const title = window.prompt("New title for this deck", target.title);
    if (title === null) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === target.title) return;
    const result = await api(`/api/decks/${target.id}/title`, {
      method: "PUT",
      body: JSON.stringify({ title: trimmed })
    }).catch(showError);
    if (!result) return;
    await refreshDecks(result.id);
    setMessage(`Renamed to ${result.title}`);
  }

  async function deleteProject(deck) {
    const target = deck || activeDeckMeta;
    if (!target) return;
    if (!window.confirm(`Delete ${target.folder}? This removes the local folder.`)) return;
    const result = await api(`/api/decks/${target.id}`, { method: "DELETE" }).catch(showError);
    if (!result) return;
    if (target.id === activeDeck) {
      setActiveDeck("");
      setSource("");
      setSlides([]);
    }
    await refreshDecks();
    setMessage(`Deleted ${result.deleted}`);
  }

  async function buildStatic(deck) {
    const target = deck || activeDeckMeta;
    if (!target) return;
    setBuilding(true);
    try {
      const data = await api(`/api/decks/${target.id}/build`, { method: "POST" });
      setMessage(`Built ${data.html}`);
    } catch (error) {
      showError(error);
    } finally {
      setBuilding(false);
    }
  }

  async function buildPdf(deck) {
    const target = deck || activeDeckMeta;
    if (!target) return;
    setBuilding(true);
    try {
      const data = await api(`/api/decks/${target.id}/pdf`, { method: "POST" });
      setMessage(`Built ${data.pdf}`);
    } catch (error) {
      showError(error);
    } finally {
      setBuilding(false);
    }
  }

  const showError = useCallback((error) => setMessage(error.message || String(error)), []);

  function toggleRail() {
    setRailHidden((prev) => {
      const next = !prev;
      localStorage.setItem(RAIL_HIDDEN_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Deck actions are exposed as hover-revealed icon buttons on each card;
  // no right-click menu anymore. Helper to stop the card's onClick firing
  // when the user clicks an action icon.
  function actionClick(handler) {
    return (e) => { e.stopPropagation(); handler(); };
  }

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setHelpOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  // Ctrl/Cmd+Enter renders from anywhere. The editor binds it too (so it wins
  // over CodeMirror's default); render()'s in-flight guard absorbs the double.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        render("Rendered");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeDeck]);

  // Guard against losing in-memory edits that have not been rendered to disk.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function navigateSlide(delta) {
    if (!slides.length) return;
    const currentIdx = slides.findIndex((s) => s.id === selectedSlideIdRef.current);
    const nextIdx = Math.max(0, Math.min(slides.length - 1, (currentIdx < 0 ? 0 : currentIdx) + delta));
    const next = slides[nextIdx];
    if (next) onSelectSlide(next.id);
  }

  // Pointer capture on the splitter is what keeps events flowing when the
  // pointer crosses into the preview iframe (which would otherwise eat them).
  function dragSplitter(e, { axis, getStart, getNext, persistKey }) {
    e.preventDefault();
    const target = e.currentTarget;
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startVal = getStart();
    const cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    let last = startVal;

    function onMove(ev) {
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      last = getNext(startVal, pos - startPos);
    }
    function onUp(ev) {
      try { target.releasePointerCapture(ev.pointerId); } catch { /* may already be released */ }
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(persistKey, String(last));
    }

    try { target.setPointerCapture(e.pointerId); } catch { /* fallback below */ }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function onHSplitterPointerDown(e) {
    dragSplitter(e, {
      axis: "y",
      getStart: () => slideListHeight,
      getNext: (startVal, delta) => {
        const maxH = Math.max(SLIDELIST_HEIGHT_MIN, window.innerHeight - EDITOR_HEIGHT_MIN - 120);
        const next = Math.max(SLIDELIST_HEIGHT_MIN, Math.min(maxH, startVal + delta));
        setSlideListHeight(next);
        return next;
      },
      persistKey: SLIDELIST_HEIGHT_KEY
    });
  }

  function onSplitterPointerDown(e) {
    dragSplitter(e, {
      axis: "x",
      getStart: () => previewWidth,
      getNext: (startVal, delta) => {
        const effectiveRail = railHidden ? 0 : railWidth;
        const middleMin = railHidden ? 80 : MIDDLE_WIDTH_MIN;
        const maxW = Math.max(PREVIEW_WIDTH_MIN, window.innerWidth - middleMin - effectiveRail);
        const next = Math.max(PREVIEW_WIDTH_MIN, Math.min(maxW, startVal - delta));
        setPreviewWidth(next);
        return next;
      },
      persistKey: PREVIEW_WIDTH_KEY
    });
  }

  function onRailSplitterPointerDown(e) {
    dragSplitter(e, {
      axis: "x",
      getStart: () => railWidth,
      getNext: (startVal, delta) => {
        const next = Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, startVal + delta));
        setRailWidth(next);
        return next;
      },
      persistKey: RAIL_WIDTH_KEY
    });
  }

  // Reveal reports visibleH/V (hidden slides are skipped), so match against
  // those when the iframe tells us its current slide.
  const onPreviewSlideChanged = useCallback((h, v) => {
    console.log(`[App] onPreviewSlideChanged ${h}/${v}, looking in ${slides.length} slides`);
    const match = slides.find((slide) => slide.visibleH === h && slide.visibleV === v);
    console.log(`[App] match found:`, match?.title || 'NONE');
    if (!match || match.id === selectedSlideIdRef.current) return;
    console.log(`[App] selecting slide ${match.id}`);
    setSelectedSlideId(match.id);
  }, [slides]);

  // Discrete status line under the editor. Red while there are edits the preview
  // has not picked up yet; muted once saved.
  const editorFooter = (
    <div className={`editor-footer ${dirty ? "unsaved" : "saved"}`}>
      {dirty ? "Unsaved changes. Press Ctrl+Enter or Save to update the preview." : "Saved"}
    </div>
  );

  return (
    <main
      className={`app-frame${railHidden ? " rail-hidden" : ""}`}
      style={{
        "--preview-w": `${previewWidth}px`,
        "--rail-w": `${railHidden ? 0 : railWidth}px`,
        "--rail-actual-w": `${railWidth}px`,
        "--rail-splitter-w": railHidden ? "0px" : "6px"
      }}
    >
      {railHidden && <div className="rail-hover-zone" aria-hidden="true" />}
      <aside className="deck-rail">
        <div className="brand-block">
          <span className="eyebrow">Local</span>
          <h1>Slide App</h1>
        </div>
        <div className="project-actions">
          <button className="btn btn-sm btn-info" type="button" onClick={createProject}>New project</button>
        </div>
        <div className="deck-list">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className={`deck-card ${deck.id === activeDeck ? "active" : ""}`}
            >
              <button
                type="button"
                className="deck-card-main"
                onClick={() => switchToDeck(deck.id)}
              >
                <span>{deck.title}</span>
                <small>{deck.folder} · {deck.slideCount} slides</small>
              </button>
              <div className="deck-card-actions">
                <button type="button" title="Rename"            onClick={actionClick(() => renameProject(deck))}><Icon name="rename" /></button>
                <button type="button" title="Clone"             onClick={actionClick(() => cloneProject(deck))}><Icon name="clone" /></button>
                <button type="button" title="Build static HTML" disabled={building}
                  onClick={actionClick(() => buildStatic(deck))}><Icon name="html" /></button>
                <button type="button" title="Build PDF"          disabled={building}
                  onClick={actionClick(() => buildPdf(deck))}><Icon name="pdf" /></button>
                <button type="button" title="Delete" className="danger"
                  onClick={actionClick(() => deleteProject(deck))}><Icon name="delete" /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div
        className="rail-splitter"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize projects rail"
        onPointerDown={onRailSplitterPointerDown}
        onDoubleClick={() => { setRailWidth(RAIL_WIDTH_DEFAULT); localStorage.setItem(RAIL_WIDTH_KEY, String(RAIL_WIDTH_DEFAULT)); }}
      />

      <section className="middle-pane">
        <header className="middle-header">
          <button
            type="button"
            className="rail-toggle"
            onClick={toggleRail}
            aria-pressed={!railHidden}
            title={railHidden ? "Show projects (☰)" : "Hide projects (☰)"}
          >
            ☰
          </button>
          <div className="middle-header-title">
            <h2>{activeDeckMeta?.title || "Select a deck"}</h2>
          </div>
          <div className="header-status">
            <span className={`save-state ${dirty ? "dirty" : ""}`}>{dirty ? "Unsaved" : "Saved"}</span>
          </div>
        </header>

        <div className="middle-tabs">
          <button type="button" className={editorMode === "slides" ? "active" : ""} onClick={() => switchEditorMode("slides")}>Slides</button>
          <button type="button" className={editorMode === "whole" ? "active" : ""} onClick={() => switchEditorMode("whole")}>Whole file</button>
        </div>

        {editorMode === "slides" ? (
          <div className="slides-view" style={{ "--slidelist-h": `${slideListHeight}px` }}>
            <div className="slide-list-pane">
              {activeDeck && slides.length ? (
                <SlideList
                  slides={slides}
                  selectedSlideId={selectedSlideId}
                  checkedSlideIds={checkedSlideIds}
                  onSelect={onSelectSlide}
                  onToggleCheck={onToggleCheck}
                  onExtendCheck={onExtendCheck}
                  onRename={onRename}
                  onAction={onSlideAction}
                  clipboardCount={clipboard.length}
                />
              ) : (
                <div className="empty-state"><p>{activeDeck ? "Loading slides…" : "Select a deck"}</p></div>
              )}
            </div>

            <div
              className="h-splitter"
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize slide list"
              onPointerDown={onHSplitterPointerDown}
              onDoubleClick={() => { setSlideListHeight(SLIDELIST_HEIGHT_DEFAULT); localStorage.setItem(SLIDELIST_HEIGHT_KEY, String(SLIDELIST_HEIGHT_DEFAULT)); }}
            />

            <div className="editor-pane">
              <div className="panel-title">
                <div className="slide-nav">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light"
                    onClick={() => navigateSlide(-1)}
                    disabled={!slides.length || (selectedSlide && selectedSlide.index === 0)}
                    title="Previous slide"
                  >‹ Prev</button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-light"
                    onClick={() => navigateSlide(1)}
                    disabled={!slides.length || (selectedSlide && selectedSlide.index === slides.length - 1)}
                    title="Next slide"
                  >Next ›</button>
                </div>
                <span className="panel-title-text">{selectedSlide ? `Body of slide ${selectedSlide.index + 1}: ${selectedSlide.title}` : "No slide selected"}</span>
                <button
                  type="button"
                  className="link-button icon-button"
                  disabled={!selectedSlide}
                  onClick={() => setImageGalleryOpen(true)}
                  title="Insert image"
                ><Icon name="image" /> Image</button>
                <button type="button" className="link-button" disabled={!dirty} onClick={() => render()} title="Save and reload the preview (Ctrl+Enter)">Save</button>
              </div>
              {selectedSlide ? (
                <Editor
                  ref={editorRef}
                  key={`${activeDeck}-${selectedSlide.id}-${structureVersion}`}
                  initialValue={extractBody(source, selectedSlide)}
                  onChange={onBodyChange}
                  onImagePaste={onImagePaste}
                  onRender={() => render()}
                />
              ) : (
                <div className="empty-state"><p>Select a slide to edit its body</p></div>
              )}
              {selectedSlide && editorFooter}
            </div>
          </div>
        ) : (
          <div className="whole-view">
            <div className="panel-title">
              <span className="panel-title-text">{activeDeckMeta ? `${activeDeckMeta.folder}/${activeDeckMeta.qmd}` : "Whole file"}</span>
              <button
                type="button"
                className="link-button icon-button"
                disabled={!activeDeck}
                onClick={() => setImageGalleryOpen(true)}
                title="Insert image"
              ><Icon name="image" /> Image</button>
              <button type="button" className="link-button" disabled={!dirty} onClick={() => render()} title="Save and reload the preview (Ctrl+Enter)">Save</button>
            </div>
            {activeDeck ? (
              <Editor
                ref={editorRef}
                key={`whole-${activeDeck}`}
                initialValue={source}
                onChange={onWholeFileChange}
                onImagePaste={onImagePaste}
                onRender={() => render()}
              />
            ) : (
              <div className="empty-state"><p>Select a deck</p></div>
            )}
            {activeDeck && editorFooter}
          </div>
        )}
      </section>

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize preview"
        onPointerDown={onSplitterPointerDown}
        onDoubleClick={() => { setPreviewWidth(PREVIEW_WIDTH_DEFAULT); localStorage.setItem(PREVIEW_WIDTH_KEY, String(PREVIEW_WIDTH_DEFAULT)); }}
      />
      <button
        type="button"
        className="help-button"
        onClick={() => setHelpOpen(true)}
        title="How this works"
        aria-label="How this works"
      >?</button>

      {helpOpen && (
        <div className="help-backdrop" onMouseDown={() => setHelpOpen(false)}>
          <div className="help-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Help">
            <div className="help-header">
              <h2>How this works</h2>
              <button type="button" className="help-close" onClick={() => setHelpOpen(false)} aria-label="Close">×</button>
            </div>
            <div className="help-body">
              <p>Local editor for Quarto Reveal slide decks. Pick a deck on the left, edit slide bodies in the middle, preview on the right. Edits stay in the editor until you render: press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or click <b>Render</b> to write the .qmd to disk and reload the preview.</p>

              <h3>Layout</h3>
              <ul>
                <li><b>☰</b> top-left toggles the project rail. Collapsed: hover the very left edge to slide it back in.</li>
                <li>Drag the vertical bar between editor and preview to resize. Double-click to reset.</li>
              </ul>

              <h3>Projects (left rail)</h3>
              <ul>
                <li>Click a project to open it.</li>
                <li>Hover over a project to reveal small action icons (rename, clone, build HTML, build PDF, delete).</li>
                <li><b>New project</b> button creates a new deck folder.</li>
              </ul>

              <h3>Slides (middle column)</h3>
              <ul>
                <li>Two tabs: <b>Slides</b> (list + body editor) and <b>Whole file</b> (full qmd in one editor).</li>
                <li><b>Prev / Next</b> buttons above the body editor walk through slides.</li>
                <li>In the slide list: click selects, double-click renames, drag reorders. Hover a row to reveal duplicate / delete icons.</li>
                <li>Hover the thin gap between two slides to reveal a "+ new slide" insert.</li>
                <li><b>Right-click</b> a slide for hide / show / copy / paste / delete on multi-selections.</li>
              </ul>

              <h3>Keyboard — slide list (click the list first)</h3>
              <ul>
                <li><kbd>↑</kbd> <kbd>↓</kbd> move selection</li>
                <li><kbd>Space</kbd> or <kbd>X</kbd> toggle the checkbox on selected slide</li>
                <li><kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> extend multi-selection</li>
              </ul>

              <h3>Keyboard — editor (CodeMirror)</h3>
              <ul>
                <li><kbd>Ctrl</kbd>+<kbd>F</kbd> find, <kbd>Ctrl</kbd>+<kbd>H</kbd> replace</li>
                <li><kbd>Ctrl</kbd>+<kbd>D</kbd> add next match to selection</li>
                <li><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+click adds another cursor</li>
                <li><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move line up/down</li>
                <li><kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> copy line</li>
                <li><kbd>Ctrl</kbd>+<kbd>/</kbd> toggle comment, <kbd>Tab</kbd> indent, <kbd>Shift</kbd>+<kbd>Tab</kbd> outdent</li>
                <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo / redo</li>
                <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> render the deck (write to disk, reload preview)</li>
              </ul>

              <h3>Rendering</h3>
              <p>The preview does not update as you type. Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or click <b>Render</b> to write the deck to disk and reload the preview. The header shows <b>Unsaved</b> until you render, then <b>Saved</b>. Switching deck renders automatically so nothing is lost; closing the tab with unsaved edits prompts first.</p>

              <h3>Quarto tips</h3>
              <ul>
                <li>Hide a slide's heading (keep it in nav / outlines): <code>## My title {"{.no-title}"}</code></li>
                <li>Paste an image from the clipboard into the editor — it saves to <code>_shared/img/</code> (global, shared across decks) and inserts <code>![](../_shared/img/paste-….png)</code> at the cursor, so copied slides keep working in other decks.</li>
                <li>Speaker notes: wrap a block in a notes fenced div:<br /><code>::: {"{.notes}"}</code><br /><code>Your speaker note here.</code><br /><code>:::</code><br />In the running deck press <kbd>S</kbd> to open the speaker view.</li>
                <li>Right-click a project → <b>Build PDF</b> renders the deck to PDF (requires <code>npm install -g decktape</code> once).</li>
              </ul>

              <p className="help-foot">Press <kbd>Esc</kbd> or click outside to close.</p>
            </div>
          </div>
        </div>
      )}

      <section className="preview-pane">
        {activeDeck ? (
          <PreviewFrame
            deckId={activeDeck}
            targetSlide={selectedSlide && selectedSlide.visibleH >= 0
              ? { h: selectedSlide.visibleH, v: selectedSlide.visibleV }
              : null}
            onSlideChanged={onPreviewSlideChanged}
            onError={showError}
          />
        ) : (
          <div className="empty-state"><p>No preview</p></div>
        )}
        {galleryAfter !== null && (
          <Gallery
            excludeDeck={activeDeck}
            onClose={() => setGalleryAfter(null)}
            onPick={(item, styleMode) => onSlideAction({
              type: "paste",
              afterSlideId: galleryAfter,
              blocks: [item.rawBlock],
              sourceDeckId: item.deckId,
              styleMode
            })}
          />
        )}
        {imageGalleryOpen && (
          <ImageGallery
            onClose={() => setImageGalleryOpen(false)}
            onPick={insertGalleryImage}
          />
        )}
      </section>
    </main>
  );
}

function extractBody(source, slide) {
  const lines = source.split(/\r?\n/);
  const bodyLines = lines.slice(slide.headingLine, slide.endLine);
  while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
  while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
  return bodyLines.join("\n");
}

// Replace the selected slide's body in `source`. Returns the new text and the
// updated `endLine` (exclusive line index of the next slide), so the caller can
// keep splice offsets correct without re-parsing.
function spliceBody(source, slide, body) {
  const lines = source.split(/\r?\n/);
  const before = lines.slice(0, slide.headingLine);
  const after = lines.slice(slide.endLine);
  const trimmedBody = body.replace(/^\s*\n/, "").replace(/\s*$/, "");
  const bodyLines = trimmedBody ? ["", ...trimmedBody.split("\n"), ""] : [""];
  return {
    text: [...before, ...bodyLines, ...after].join("\n"),
    endLine: slide.headingLine + bodyLines.length
  };
}

function readClipboard() {
  try { return JSON.parse(localStorage.getItem(CLIPBOARD_KEY) || "[]"); }
  catch { return []; }
}

function readPreviewWidth() {
  const stored = parseInt(localStorage.getItem(PREVIEW_WIDTH_KEY) || "", 10);
  return Number.isFinite(stored) && stored >= PREVIEW_WIDTH_MIN ? stored : PREVIEW_WIDTH_DEFAULT;
}

function readSlideListHeight() {
  const stored = parseInt(localStorage.getItem(SLIDELIST_HEIGHT_KEY) || "", 10);
  return Number.isFinite(stored) && stored >= SLIDELIST_HEIGHT_MIN ? stored : SLIDELIST_HEIGHT_DEFAULT;
}

function readRailWidth() {
  const stored = parseInt(localStorage.getItem(RAIL_WIDTH_KEY) || "", 10);
  if (!Number.isFinite(stored)) return RAIL_WIDTH_DEFAULT;
  return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, stored));
}

function readDeckFromHash() {
  try { return decodeURIComponent(window.location.hash.replace(/^#/, "")); }
  catch { return ""; }
}

function writeDeckToHash(deckId) {
  if (!deckId) return; // leave hash alone until a real deck is selected
  const next = `#${encodeURIComponent(deckId)}`;
  if (window.location.hash === next) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(null, "", url);
}

function labelFor(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
