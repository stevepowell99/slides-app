"""Render-and-screenshot helper for the demo decks.

Usage:
    python shoot.py <deck>            # all slides
    python shoot.py <deck> 0 1 5      # specific slide indices
    python shoot.py all               # all five demo decks, all slides
"""
from __future__ import annotations

import http.server
import socketserver
import subprocess
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8765


def start_server() -> None:
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
    srv.daemon_threads = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
DECKS = [
    "demo-moonlight",
    "demo-editorial",
    "demo-brutalist",
    "demo-terminal",
    "demo-pastel-cards",
]
OUT = Path(__file__).resolve().parent / "shots"
OUT.mkdir(exist_ok=True)


def render(deck: str) -> Path:
    qmd = ROOT / deck / "slides.qmd"
    subprocess.run(
        ["quarto", "render", str(qmd)],
        check=True,
        cwd=str(ROOT / deck),
    )
    return ROOT / deck / "slides.html"


def shoot(deck: str, slide_idx: list[int] | None = None) -> None:
    render(deck)
    url = f"http://127.0.0.1:{PORT}/{deck}/slides.html"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 720})
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_function("window.Reveal && window.Reveal.isReady && window.Reveal.isReady()")
        # Build a flat list of {h, v} for every slide (horizontal + vertical).
        coords = page.evaluate(
            "Reveal.getSlides().map(s => { const i = Reveal.getIndices(s); return [i.h, i.v || 0]; })"
        )
        indices = slide_idx if slide_idx else list(range(len(coords)))
        for i in indices:
            h, v = coords[i]
            page.evaluate(f"Reveal.slide({h}, {v})")
            # Wait for any lazy-loaded images on the active slide to settle.
            try:
                page.wait_for_function(
                    """() => {
                        const s = document.querySelector('section.present');
                        if (!s) return false;
                        return [...s.querySelectorAll('img')].every(i => i.complete);
                    }""",
                    timeout=15000,
                )
            except Exception as e:
                print(f"  (image wait timed out for slide {i}, continuing)")
            page.wait_for_timeout(700)
            target = OUT / f"{deck}_{i:02d}.png"
            page.screenshot(path=str(target), full_page=False)
            print(f"  {target.name}")
        browser.close()


def main() -> None:
    start_server()
    args = sys.argv[1:]
    if not args or args[0] == "all":
        for d in DECKS:
            print(d)
            shoot(d)
        return
    deck = args[0]
    idx = [int(x) for x in args[1:]] if len(args) > 1 else None
    print(deck)
    shoot(deck, idx)


if __name__ == "__main__":
    main()
