import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
deck = sys.argv[1] if len(sys.argv) > 1 else "demo-brutalist"
url = "file:///" + str(ROOT / deck / "slides.html").replace("\\", "/")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.goto(url)
    page.wait_for_function("window.Reveal && Reveal.isReady && Reveal.isReady()")
    coords = page.evaluate(
        """Reveal.getSlides().map(s => {
            const i = Reveal.getIndices(s);
            const h = s.querySelector('h1,h2');
            return [i.h, i.v || 0, h ? h.textContent.trim().slice(0,40) : (s.id || '?')];
        })"""
    )
    for i, c in enumerate(coords):
        print(i, c)
    b.close()
