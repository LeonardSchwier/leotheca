#!/usr/bin/env python3
"""Record a short demo video of Leotheca's key interactions."""
import os, re, time, sys, json

HERE = os.path.dirname(os.path.abspath(__file__))
MOCK_JS_PATH = os.path.join(HERE, "tauriMock.js")
VIDEO_DIR = "/tmp/leotheca_demo_video"
os.makedirs(VIDEO_DIR, exist_ok=True)

def extract_mock_js(path):
    raw = open(path).read()
    m = re.search(r"const TAURI_MOCK_JS = `(.*?)`;", raw, re.DOTALL)
    return m.group(1) if m else raw

def main():
    from playwright.sync_api import sync_playwright
    mock_js = extract_mock_js(MOCK_JS_PATH)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=VIDEO_DIR,
            record_video_size={"width": 1440, "height": 900},
        )
        page = context.new_page()
        page.set_default_timeout(15000)

        # Inject Tauri mock BEFORE navigation
        page.add_init_script(mock_js)

        print("[DEMO] Loading app...")
        page.goto("http://127.0.0.1:5173/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)  # entrance animations

        # === SCENE 1: Initial view (file tree + welcome) ===
        print("[DEMO] Scene 1: Initial load")
        time.sleep(2)

        # === SCENE 2: Click a file in the tree ===
        print("[DEMO] Scene 2: Opening a file")
        items = page.query_selector_all(".file-tree-item")
        if items:
            # Click "ai.md" (has rich markdown)
            for item in items:
                if "ai" in (item.inner_text() or "").lower():
                    item.click()
                    break
            else:
                items[-1].click()
            time.sleep(2.5)

        # === SCENE 3: Switch to Preview mode ===
        print("[DEMO] Scene 3: Preview mode")
        options = page.query_selector_all(".segmented-option")
        for o in options:
            if "Preview" in (o.inner_text() or ""):
                o.click()
                break
        time.sleep(2)

        # === SCENE 4: Search ===
        print("[DEMO] Scene 4: Search")
        search = page.query_selector(".sidebar-search input")
        if search:
            search.fill("Transformer")
            time.sleep(1.5)
            # Clear search
            search.fill("")
            time.sleep(1.5)

        # === SCENE 5: Theme toggle (dark -> light or vice versa) ===
        print("[DEMO] Scene 5: Theme toggle")
        # Try to find and click a theme toggle button
        theme_btn = page.query_selector('[aria-label*="theme" i], [class*="theme-toggle"]')
        if theme_btn:
            theme_btn.click()
            time.sleep(2)
        else:
            # Toggle via CSS
            page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
            time.sleep(2)
            page.evaluate("document.documentElement.removeAttribute('data-theme')")
            time.sleep(1)

        # === SCENE 6: Back to a file ===
        print("[DEMO] Scene 6: Final state")
        items = page.query_selector_all(".file-tree-item")
        if items:
            for item in items:
                if "welcome" in (item.inner_text() or "").lower():
                    item.click()
                    break
            time.sleep(2)

        print("[DEMO] Settle")
        time.sleep(2)

        context.close()  # video flushes here
        browser.close()

    # Find the video
    videos = [f for f in os.listdir(VIDEO_DIR) if f.endswith(".webm")]
    if not videos:
        print("[DEMO] ERROR: No video found")
        sys.exit(1)

    src = os.path.join(VIDEO_DIR, videos[-1])
    size = os.path.getsize(src)
    print(f"[DEMO] Video: {src} ({size / 1024:.0f} KB)")
    print(f"[DEMO] Done. Convert with ffmpeg.")
    return src

if __name__ == "__main__":
    main()
