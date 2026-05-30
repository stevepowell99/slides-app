import { Fragment, useEffect, useRef, useState } from "react";

import { Icon } from "./Icons.jsx";

export function SlideList({
  slides,
  selectedSlideId,
  checkedSlideIds,
  onSelect,
  onToggleCheck,
  onExtendCheck,
  onRename,
  onAction,
  clipboardCount
}) {
  const [renaming, setRenaming] = useState(null); // { slideId, value }
  const [dragId, setDragId] = useState("");
  const [dropBeforeId, setDropBeforeId] = useState("");
  const [menu, setMenu] = useState(null);
  const [insertMenu, setInsertMenu] = useState(null); // { slideId }
  const renameInputRef = useRef(null);
  const listRef = useRef(null);
  const rowRefs = useRef(new Map());

  // Select-all on entering rename mode, but NOT on every keystroke
  // (otherwise each typed character would be reselected and overwritten).
  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming?.slideId]);

  useEffect(() => {
    if (!selectedSlideId) return;
    const el = rowRefs.current.get(selectedSlideId);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedSlideId]);

  useEffect(() => {
    if (!menu) return;
    function close() { setMenu(null); }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  useEffect(() => {
    if (!insertMenu) return;
    function close() { setInsertMenu(null); }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [insertMenu]);

  function startRename(slide) {
    // Seed with the raw heading line so the user can edit level (# vs ##),
    // attributes ({.no-title}, visibility="hidden", etc.) and title together.
    setRenaming({ slideId: slide.id, value: slide.rawHeading || slide.title });
  }

  function commitRename() {
    if (!renaming) return;
    const current = slides.find((slide) => slide.id === renaming.slideId);
    const nextValue = renaming.value.trim();
    setRenaming(null);
    if (!current || !nextValue || nextValue === (current.rawHeading || current.title)) return;
    onRename(renaming.slideId, nextValue);
  }

  function cancelRename() { setRenaming(null); }

  function onDragStart(event, slideId) {
    setDragId(slideId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", slideId);
  }

  function onDragEnd() {
    setDragId("");
    setDropBeforeId("");
  }

  function onDragOver(event, slideId) {
    if (!dragId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const ids = slides.map((slide) => slide.id);
    const targetIdx = ids.indexOf(slideId);
    const insertBeforeId = before ? slideId : ids[targetIdx + 1] || "__end";
    setDropBeforeId(insertBeforeId);
  }

  function onDrop(event) {
    event.preventDefault();
    const sourceId = dragId;
    const beforeId = dropBeforeId;
    setDragId("");
    setDropBeforeId("");
    if (!sourceId || !beforeId || sourceId === beforeId) return;

    const moving = checkedSlideIds.includes(sourceId) && checkedSlideIds.length > 1
      ? slides.filter((slide) => checkedSlideIds.includes(slide.id)).map((slide) => slide.id)
      : [sourceId];

    if (moving.includes(beforeId)) return;
    onAction({ type: "move", slideIds: moving, beforeSlideId: beforeId });
  }

  function onRowContextMenu(event, slide) {
    event.preventDefault();
    if (!checkedSlideIds.includes(slide.id)) onSelect(slide.id);
    setMenu({ x: event.clientX, y: event.clientY, slide });
  }

  function onListKeyDown(event) {
    if (renaming) return;
    if (!slides.length) return;
    const currentIdx = slides.findIndex((s) => s.id === selectedSlideId);
    const key = event.key;

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const delta = key === "ArrowDown" ? 1 : -1;
      const nextIdx = currentIdx < 0
        ? (delta > 0 ? 0 : slides.length - 1)
        : Math.max(0, Math.min(slides.length - 1, currentIdx + delta));
      if (nextIdx === currentIdx) return;
      if (event.shiftKey && selectedSlideId && onExtendCheck) {
        onExtendCheck([selectedSlideId, slides[nextIdx].id]);
      }
      onSelect(slides[nextIdx].id);
    } else if (key === " " || key === "x" || key === "X") {
      if (!selectedSlideId) return;
      event.preventDefault();
      onToggleCheck(selectedSlideId);
    }
  }

  const targets = (mode) => {
    if (mode === "selected") return checkedSlideIds.length ? checkedSlideIds : (selectedSlideId ? [selectedSlideId] : []);
    return [];
  };

  // Per-row icon click: act on all checked rows if this row is one of them
  // (so toggling on any selected row applies to the whole multi-selection),
  // otherwise just this row.
  const targetsFor = (slide) =>
    checkedSlideIds.includes(slide.id) && checkedSlideIds.length > 1
      ? checkedSlideIds
      : [slide.id];

  return (
    <div className="slide-list-host">
      <div className="slide-list-actions">
        <span className="slide-list-hint">
          {checkedSlideIds.length ? `${checkedSlideIds.length} checked` : "Click · double-click rename · drag reorder · ↑↓ nav · space/X toggle · shift+↑↓ multi-select · hover row for actions"}
          {clipboardCount ? ` · ${clipboardCount} in clipboard` : ""}
        </span>
      </div>

      <ul
        ref={listRef}
        className="slide-list"
        tabIndex={0}
        onKeyDown={onListKeyDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {slides.map((slide, slideIdx) => {
          const isSelected = slide.id === selectedSlideId;
          const isChecked = checkedSlideIds.includes(slide.id);
          const isDropBefore = dropBeforeId === slide.id;
          const stop = (e) => e.stopPropagation();
          return (
            <Fragment key={slide.id}>
              <li
                ref={(el) => {
                  if (el) rowRefs.current.set(slide.id, el);
                  else rowRefs.current.delete(slide.id);
                }}
                className={[
                  "slide-row",
                  isSelected ? "selected" : "",
                  isChecked ? "checked" : "",
                  slide.hidden ? "hidden" : "",
                  slide.level === 1 ? "section" : "",
                  isDropBefore ? "drop-before" : ""
                ].filter(Boolean).join(" ")}
                draggable={!renaming}
                onDragStart={(e) => onDragStart(e, slide.id)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onDragOver(e, slide.id)}
                onClick={() => { onSelect(slide.id); listRef.current?.focus(); }}
                onDoubleClick={() => startRename(slide)}
                onContextMenu={(e) => onRowContextMenu(e, slide)}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => { e.stopPropagation(); onToggleCheck(slide.id); }}
                  onClick={stop}
                />
                <span className="slide-index">{slide.index + 1}</span>
                {renaming?.slideId === slide.id ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    className="slide-rename-input"
                    value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") cancelRename();
                    }}
                    onClick={stop}
                  />
                ) : (
                  <span className="slide-title">{slide.title || "(untitled)"}</span>
                )}
                <div className="slide-row-actions">
                  <button
                    type="button"
                    className={slide.hidden ? "active" : ""}
                    title={slide.hidden ? "Show slide" : "Hide slide"}
                    onClick={(e) => { stop(e); onAction({ type: slide.hidden ? "show" : "hide", slideIds: targetsFor(slide) }); }}
                  ><Icon name="hide" /></button>
                  <button
                    type="button"
                    className={slide.noTitle ? "active" : ""}
                    title={slide.noTitle ? "Show title" : "Hide title"}
                    onClick={(e) => { stop(e); onAction({ type: slide.noTitle ? "show-title" : "hide-title", slideIds: targetsFor(slide) }); }}
                  ><Icon name="title-off" /></button>
                  <button
                    type="button"
                    title="Copy"
                    onClick={(e) => { stop(e); onAction({ type: "copy", slideIds: targetsFor(slide) }); }}
                  ><Icon name="copy" /></button>
                  <button
                    type="button"
                    title="Paste after"
                    disabled={!clipboardCount}
                    onClick={(e) => { stop(e); onAction({ type: "paste", afterSlideId: slide.id }); }}
                  ><Icon name="paste" /></button>
                  <button
                    type="button"
                    title="Duplicate slide"
                    onClick={(e) => { stop(e); onAction({ type: "duplicate", slideId: slide.id }); }}
                  ><Icon name="duplicate" /></button>
                  <button
                    type="button"
                    title="Delete slide"
                    className="danger"
                    onClick={(e) => { stop(e); onAction({ type: "delete", slideIds: targetsFor(slide) }); }}
                  ><Icon name="delete" /></button>
                </div>
                <button
                  type="button"
                  className="slide-insert-btn"
                  title="Insert slide here"
                  onClick={(e) => { stop(e); setInsertMenu({ slideId: slide.id }); }}
                ><Icon name="plus" /></button>
                {insertMenu?.slideId === slide.id && (
                  <div className="slide-insert-menu" onMouseDown={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { onAction({ type: "new", afterSlideId: slide.id }); setInsertMenu(null); }}>
                      Blank slide
                    </button>
                    <button type="button" onClick={() => { onAction({ type: "gallery-open", afterSlideId: slide.id }); setInsertMenu(null); }}>
                      From gallery…
                    </button>
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
        <li
          className={`slide-row slide-row-tail ${dropBeforeId === "__end" ? "drop-before" : ""}`}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setDropBeforeId("__end");
          }}
        />
      </ul>

      {menu && (
        <div className="slide-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { startRename(menu.slide); setMenu(null); }}>Rename</button>
          <button type="button" onClick={() => { onAction({ type: "hide", slideIds: targets("selected") }); setMenu(null); }}>Hide</button>
          <button type="button" onClick={() => { onAction({ type: "show", slideIds: targets("selected") }); setMenu(null); }}>Show</button>
          <button type="button" onClick={() => { onAction({ type: "hide-title", slideIds: targets("selected") }); setMenu(null); }}>Hide title</button>
          <button type="button" onClick={() => { onAction({ type: "show-title", slideIds: targets("selected") }); setMenu(null); }}>Show title</button>
          <button type="button" onClick={() => { onAction({ type: "copy", slideIds: targets("selected") }); setMenu(null); }}>Copy</button>
          <button type="button" disabled={!clipboardCount} onClick={() => { onAction({ type: "paste" }); setMenu(null); }}>Paste after</button>
          <button type="button" className="danger" onClick={() => { onAction({ type: "delete", slideIds: targets("selected") }); setMenu(null); }}>Delete</button>
        </div>
      )}
    </div>
  );
}
