import http.server
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8765
deck = sys.argv[1] if len(sys.argv) > 1 else "demo-moonlight"
slide_h = int(sys.argv[2]) if len(sys.argv) > 2 else 0
slide_v = int(sys.argv[3]) if len(sys.argv) > 3 else 4

handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(ROOT), **k)
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{PORT}/{deck}/slides.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.on("console", lambda m: print("console:", m.text))
    page.on("requestfailed", lambda r: print("requestfailed:", r.url, r.failure))
    page.goto(url)
    page.wait_for_function("window.Reveal && Reveal.isReady && Reveal.isReady()")
    page.evaluate(f"Reveal.slide({slide_h}, {slide_v})")
    page.wait_for_timeout(5000)
    info = page.evaluate(
        """() => {
            const s = document.querySelector('section.present');
            return [...s.querySelectorAll('img')].map(i => ({
                src: i.src,
                dataSrc: i.getAttribute('data-src'),
                complete: i.complete,
                naturalWidth: i.naturalWidth,
                naturalHeight: i.naturalHeight,
                clientWidth: i.clientWidth,
                clientHeight: i.clientHeight,
                className: i.className,
            }));
        }"""
    )
    import json
    print(json.dumps(info, indent=2))
    b.close()
