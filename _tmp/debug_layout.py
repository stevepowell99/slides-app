import http.server
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8766
deck = sys.argv[1] if len(sys.argv) > 1 else "demo-pastel-cards"
slide_h = int(sys.argv[2]) if len(sys.argv) > 2 else 0
slide_v = int(sys.argv[3]) if len(sys.argv) > 3 else 2

handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{PORT}/{deck}/slides.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.goto(url)
    page.wait_for_function("window.Reveal && Reveal.isReady && Reveal.isReady()")
    page.evaluate(f"Reveal.slide({slide_h}, {slide_v})")
    page.wait_for_timeout(2000)
    info = page.evaluate(
        """() => {
            const s = Reveal.getCurrentSlide();
            const h = s.querySelector('h1, h2');
            return {
                section: { w: s.offsetWidth, h: s.offsetHeight, cs: getComputedStyle(s).padding, bcr: s.getBoundingClientRect() },
                viewport: { w: window.innerWidth, h: window.innerHeight },
                slidesContainer: { w: document.querySelector('.slides').offsetWidth, bcr: document.querySelector('.slides').getBoundingClientRect() },
                heading: h ? { tag: h.tagName, w: h.offsetWidth, bcr: h.getBoundingClientRect(), padding: getComputedStyle(h).padding, margin: getComputedStyle(h).margin } : null,
            };
        }"""
    )
    import json
    print(json.dumps(info, indent=2, default=str))
    b.close()
