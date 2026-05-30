import { useEffect, useRef, useState } from "react";

import { api } from "./api.js";

// Embeds `quarto preview` in an iframe and bridges navigation via postMessage.
// The deck's rendered HTML includes _shared/preview-bridge.html, which forwards
// Reveal `ready`/`slidechanged` events to us and accepts `{type:'goto', h, v}`.

export function PreviewFrame({ deckId, targetSlide, onSlideChanged, onError }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [srcUrl, setSrcUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const iframeRef = useRef(null);
  const targetRef = useRef(targetSlide);
  const onSlideChangedRef = useRef(onSlideChanged);
  const lastGotoRef = useRef({ h: -1, v: -1 });

  targetRef.current = targetSlide;
  onSlideChangedRef.current = onSlideChanged;

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
        // After every iframe (re)load, push the parent's current slide back in.
        const t = targetRef.current;
        if (t) sendGoto(t.h, t.v);
        return;
      }

      if (data.type === "slidechanged") {
        const goto = lastGotoRef.current;
        const matchesGoto = data.h === goto.h && data.v === goto.v;
        if (matchesGoto) {
          // This is the response to our goto command; ignore it.
          lastGotoRef.current = { h: -1, v: -1 };
          return;
        }
        // User navigated; report back to parent.
        console.log(`[PreviewFrame] slidechanged ${data.h}/${data.v} → onSlideChanged`);
        onSlideChangedRef.current?.(data.h, data.v);
      }
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!targetSlide) return;
    sendGoto(targetSlide.h, targetSlide.v);
  }, [targetSlide?.h, targetSlide?.v]);

  function sendGoto(h, v) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    lastGotoRef.current = { h, v };
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
        <iframe
          ref={iframeRef}
          title="Slide preview"
          src={srcUrl}
        />
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
