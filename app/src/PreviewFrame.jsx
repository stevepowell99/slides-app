import { useEffect, useRef, useState } from "react";

import { api } from "./api.js";

// Embeds `quarto preview` in an iframe and bridges navigation via postMessage.
// The deck's rendered HTML includes _shared/preview-bridge.html, which forwards
// Reveal `ready`/`slidechanged` events to us and accepts `{type:'goto', h, v}`.

export function PreviewFrame({ deckId, targetSlide, onSlideChanged, onSlides, onError }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [srcUrl, setSrcUrl] = useState("");
  const [status, setStatus] = useState("idle");
  // The deck's slide aspect ratio (width / height), reported by the bridge on
  // ready. Holds the preview box to a fixed slide shape as the divider moves.
  const [aspect, setAspect] = useState(16 / 9);
  const iframeRef = useRef(null);
  const targetRef = useRef(targetSlide);
  const onSlideChangedRef = useRef(onSlideChanged);
  const onSlidesRef = useRef(onSlides);
  // Every goto we send, timestamped. A slidechanged that matches a recent one is
  // our own command echoing back, not a user navigation. A single-slot guard
  // breaks under rapid keyboard nav (several gotos in flight at once), which is
  // what made the panes oscillate; a short-lived list absorbs the whole burst.
  const recentGotosRef = useRef([]);
  // The deck's actual current position, from the latest slidechanged/ready. Used
  // to skip a goto when the selection already came from the preview, so we never
  // shove the preview back to where the user just navigated away from.
  const previewPosRef = useRef(null);

  targetRef.current = targetSlide;
  onSlideChangedRef.current = onSlideChanged;
  onSlidesRef.current = onSlides;

  useEffect(() => {
    if (!deckId) return;
    setBaseUrl("");
    setStatus("starting");

    let cancelled = false;
    api(`/api/decks/${deckId}/preview`, { method: "POST" })
      .then((data) => {
        if (cancelled) return;
        // Cache-bust the iframe URL so the PWA/browser fetches the freshly
        // rendered HTML rather than a stale copy from an earlier visit.
        const sep = data.url.includes("?") ? "&" : "?";
        setBaseUrl(data.url);
        setSrcUrl(`${data.url}${sep}cb=${Date.now()}`);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        onError?.(error);
      });

    return () => { cancelled = true; };
  }, [deckId]);

  useEffect(() => {
    function handler(event) {
      const data = event.data;
      if (!data || data.source !== "slide-bridge") return;

      if (data.type === "ready") {
        // The rendered deck just told us exactly which slides exist and where.
        if (data.slides) onSlidesRef.current?.(data.slides);
        if (Number.isFinite(data.width) && Number.isFinite(data.height) && data.height > 0) {
          setAspect(data.width / data.height);
        }
        previewPosRef.current = { h: data.h, v: data.v };
        // If the parent already has a slide selected, push it back into the
        // freshly (re)loaded deck. Otherwise let the deck lead: report whatever
        // it is showing so the parent selects the matching row, which is why
        // the title slide and the rail no longer disagree on first load.
        const t = targetRef.current;
        if (t) sendGoto(t.h, t.v);
        else onSlideChangedRef.current?.(data.h, data.v);
        return;
      }

      if (data.type === "slidechanged") {
        previewPosRef.current = { h: data.h, v: data.v };
        // Our own goto echoing back: consume the matching command and ignore it.
        if (consumeEcho(data.h, data.v)) return;
        // A real navigation inside the deck; let the rail and editor follow.
        onSlideChangedRef.current?.(data.h, data.v);
      }
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!targetSlide) return;
    // If the deck is already here, the selection came from the preview itself
    // (a user navigation we just followed). Sending a goto would shove it back.
    const p = previewPosRef.current;
    if (p && p.h === targetSlide.h && p.v === targetSlide.v) return;
    sendGoto(targetSlide.h, targetSlide.v);
  }, [targetSlide?.h, targetSlide?.v]);

  // True if (h, v) matches a goto we sent in the last moment; consumes it so a
  // burst of identical commands is matched one-for-one against its echoes.
  function consumeEcho(h, v) {
    const now = Date.now();
    const live = recentGotosRef.current.filter((g) => now - g.at < 1500);
    const idx = live.findIndex((g) => g.h === h && g.v === v);
    if (idx === -1) { recentGotosRef.current = live; return false; }
    live.splice(idx, 1);
    recentGotosRef.current = live;
    return true;
  }

  function sendGoto(h, v) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    recentGotosRef.current.push({ h, v, at: Date.now() });
    previewPosRef.current = { h, v };
    win.postMessage({ source: "slide-bridge", type: "goto", h, v }, "*");
  }

  function reload() {
    if (!iframeRef.current || !baseUrl) return;
    // Cache-bust so the browser refetches the freshly rendered HTML instead of
    // serving a stale copy (Quarto re-renders to the same URL on every change).
    const sep = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${sep}cb=${Date.now()}`;
    setSrcUrl(url);
    iframeRef.current.src = url;
  }

  return (
    <div className="preview-frame">
      <div className="preview-meta">
        <span>
          {status === "starting" && "Starting Quarto preview…"}
          {status === "ready" && (targetSlide ? `Slide ${targetSlide.h}/${targetSlide.v}` : "Preview")}
          {status === "error" && "Preview failed"}
        </span>
        <span className="preview-actions">
          {baseUrl && <a className="link-button" href={baseUrl} target="_blank" rel="noreferrer">Open in tab</a>}
          {baseUrl && <button type="button" className="link-button" onClick={reload}>Reload</button>}
        </span>
      </div>
      {baseUrl ? (
        <div className="preview-stage" style={{ "--preview-aspect": aspect }}>
          <iframe
            ref={iframeRef}
            title="Slide preview"
            src={srcUrl}
            // Let Reveal's F key enter fullscreen: a browser blocks an iframe's
            // requestFullscreen unless the parent grants it here.
            allow="fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="preview-loader" role="status" aria-live="polite">
          {status === "error" ? (
            <p className="preview-loader-text error">Could not start Quarto preview</p>
          ) : (
            <>
              <span className="preview-spinner" aria-hidden="true" />
              <p className="preview-loader-text">Starting Quarto preview…</p>
              <p className="preview-loader-sub">First render can take a few seconds</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
