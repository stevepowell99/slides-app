import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api.js";

export function Gallery({ excludeDeck, onPick, onClose }) {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null); // selected item awaiting style-mode choice
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api("/api/slides/all")
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load slides"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (confirming) setConfirming(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirming]);

  function pick(item, styleMode) {
    onPick(item, styleMode);
    onClose();
  }

  function cardStyle(bg) {
    if (!bg) return undefined;
    const rgb = parseColor(bg);
    if (!rgb) return { background: bg };
    // Perceived luminance (rec. 709). >0.6 = treat as light bg, use dark text.
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return { background: bg, color: lum > 0.6 ? "#181820" : "#f7f4ec" };
  }

  // Accept #rgb, #rrggbb, rgb(...). Anything else returns null and we keep
  // the default text colour over the raw bg (best effort).
  function parseColor(input) {
    const s = input.trim().toLowerCase();
    let m = s.match(/^#([0-9a-f]{3})$/);
    if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
    m = s.match(/^#([0-9a-f]{6})$/);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }

  const filtered = useMemo(() => {
    if (!items) return [];
    const base = items.filter((i) => i.deckId !== excludeDeck);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) =>
      i.deckTitle.toLowerCase().includes(q)
      || i.title.toLowerCase().includes(q)
      || i.excerpt.toLowerCase().includes(q)
    );
  }, [items, query, excludeDeck]);

  return (
    <div className="gallery-backdrop" onMouseDown={onClose}>
      <div className="gallery-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Slide gallery">
        <div className="gallery-header">
          <input
            ref={inputRef}
            type="text"
            className="gallery-search"
            placeholder="Filter by deck, title, or text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="gallery-count">
            {items ? `${filtered.length} of ${items.length - items.filter((i) => i.deckId === excludeDeck).length}` : "loading…"}
          </span>
          <button type="button" className="gallery-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="gallery-error">{error}</div>}

        {items && !filtered.length && !error && (
          <div className="gallery-empty">No slides match.</div>
        )}

        {confirming && (
          <div className="gallery-confirm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="gallery-confirm-meta">
              <span className="gallery-confirm-deck">{confirming.deckTitle}</span>
              <span className="gallery-confirm-title">{confirming.title || "(untitled)"}</span>
            </div>
            <div className="gallery-confirm-actions">
              <button
                type="button"
                className="primary"
                onClick={() => pick(confirming, "missing")}
                autoFocus
              >Insert · add missing styles</button>
              <button
                type="button"
                className="warn"
                onClick={() => pick(confirming, "override")}
                title="Replaces matching selectors in this deck's CSS with the source's"
              >Insert · override deck styles</button>
              <button type="button" className="link" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="gallery-grid">
          {filtered.map((item) => (
            <button
              type="button"
              key={`${item.deckId}:${item.slideId}`}
              className={`gallery-card${item.hidden ? " hidden" : ""}${item.level === 1 ? " section" : ""}`}
              style={cardStyle(item.backgroundColor)}
              onClick={() => setConfirming(item)}
              title={`${item.deckTitle} · slide ${item.index + 1}`}
            >
              <span className="gallery-card-deck">{item.deckTitle}</span>
              <span className="gallery-card-title">{item.title || "(untitled)"}</span>
              {item.excerpt && <span className="gallery-card-excerpt">{item.excerpt}</span>}
              <span className="gallery-card-meta">
                <span>#{item.index + 1}</span>
                {item.hidden && <span className="flag">hidden</span>}
                {item.noTitle && <span className="flag">no title</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
