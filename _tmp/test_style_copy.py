"""End-to-end smoke test for cross-deck paste + auto CSS copy.

Spins up the app server against a temp copy of two decks, posts a paste action
from one deck into the other, and reports what got added to the target CSS.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

REPO = Path(r"C:\Users\Zoom\My Drive (hello@causalmap.app)\Causal Map\10-19 Outreach - marketing - presentations - academic - theory\19c-slides")
APP = REPO / "app"


def http(method, path, body=None, port=3298):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=data,
        method=method,
        headers={"content-type": "application/json"} if body is not None else {},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def main():
    # Use an isolated temp root so we don't mutate Steve's files
    tmp = Path(tempfile.mkdtemp(prefix="slides-test-"))
    shutil.copytree(REPO / "_shared", tmp / "_shared")
    shutil.copytree(REPO / "demo-brutalist", tmp / "demo-brutalist")
    shutil.copytree(REPO / "demo-moonlight", tmp / "demo-moonlight")
    shutil.copy(REPO / "_quarto.yml", tmp / "_quarto.yml")
    print("temp root:", tmp)

    env = {
        **os.environ,
        "PORT": "3298",
    }
    # Server resolves repoRoot as parent of app/. Move app/ into tmp.
    shutil.copytree(APP, tmp / "app", ignore=shutil.ignore_patterns("node_modules", "dist", ".vite"))

    p = subprocess.Popen(["node", str(tmp / "app" / "server" / "index.js")], env=env,
                         cwd=str(tmp / "app"),
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        time.sleep(2)
        # Pick a brutalist slide that uses several classes
        slides = http("GET", "/api/slides/all")
        bru = [s for s in slides if s["deckId"] == "demo-brutalist"]
        # Find SPLIT slide (uses .splitgrid .panel-black .panel-yellow .label etc)
        target_slide = next((s for s in bru if s["title"] == "SPLIT"), bru[3])
        print("source slide:", target_slide["deckId"], target_slide["title"])

        # Capture target CSS before
        moon_css = (tmp / "demo-moonlight" / "moonlight.css").read_text()
        before_len = len(moon_css)

        # Pick anything in moonlight to insert after
        moon_slides = [s for s in slides if s["deckId"] == "demo-moonlight"]
        moon_after = moon_slides[2]["slideId"]

        resp = http("POST", "/api/decks/demo-moonlight/slides/apply", {
            "type": "paste",
            "afterSlideId": moon_after,
            "blocks": [target_slide["rawBlock"]],
            "sourceDeckId": "demo-brutalist",
        })

        print("stylesAdded:", json.dumps(resp.get("stylesAdded"), indent=2))

        after = (tmp / "demo-moonlight" / "moonlight.css").read_text()
        added = after[before_len:]
        print("---- appended to moonlight.css ----")
        print(added)
        print("-----------------------------------")
    finally:
        p.terminate()
        try: p.wait(timeout=3)
        except Exception: p.kill()


if __name__ == "__main__":
    main()
