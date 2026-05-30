import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api.js";

// Encode each path segment but keep the slashes so /media/<sub/path>.png resolves.
function mediaUrl(repoPath) {
  return "/media/" + repoPath.split("/").map(encodeURIComponent).join("/");
}

export function ImageGallery({ onPick, onClose }) {
  const [items, setItems] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api("/api/images/all")
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load images"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.filename.toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div className="gallery-backdrop" onMouseDown={onClose}>
      <div className="gallery-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Image gallery">
        <div className="gallery-header">
          <input
            ref={inputRef}
            type="text"
            className="gallery-search"
            placeholder="Filter images by name or folder…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="gallery-count">{items ? `${filtered.length} of ${items.length}` : "loading…"}</span>
          <button type="button" className="gallery-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="gallery-error">{error}</div>}
        {items && !filtered.length && !error && <div className="gallery-empty">No images match.</div>}

        <div className="image-grid">
          {filtered.map((item) => (
            <button
              type="button"
              key={item.path}
              className="image-card"
              onClick={() => { onPick(item); onClose(); }}
              title={item.path}
            >
              <span className="image-thumb">
                <img src={mediaUrl(item.path)} alt={item.filename} loading="lazy" />
              </span>
              <span className="image-card-name">{item.filename}</span>
              <span className="image-card-folder">{item.folder}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
