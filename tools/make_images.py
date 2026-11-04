"""링크 미리보기 이미지를 다시 만드는 스크립트.

    python tools/make_images.py

tools/og.html → og.png (1200×630, 300KB 이하)
tools/icon.html → apple-touch-icon.png (180×180)

필요한 것: Python, Pillow(pip install pillow), Microsoft Edge 또는 Chrome
"""
import functools
import http.server
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAX_OG_BYTES = 300 * 1024
BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def find_browser():
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    found = shutil.which('msedge') or shutil.which('google-chrome') or shutil.which('chromium')
    if not found:
        raise SystemExit('Edge나 Chrome을 찾지 못했어요')
    return found


def capture(browser, url, width, height, tmp):
    """헤드리스 브라우저로 찍고 왼쪽 위 width×height만 잘라 돌려준다 (창 크기가 뷰포트보다 작게 잡혀도 잘리지 않게 여유를 둔다)."""
    shot = Path(tmp) / 'shot.png'
    shot.unlink(missing_ok=True)
    subprocess.run([
        browser, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        f'--user-data-dir={Path(tmp) / "profile"}', f'--screenshot={shot}',
        f'--window-size={width + 200},{height + 200}', '--virtual-time-budget=8000', url,
    ], check=True, timeout=90, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with Image.open(shot) as img:
        return img.convert('RGB').crop((0, 0, width, height))


def save_og(img):
    path = ROOT / 'og.png'
    img.save(path, optimize=True)
    if path.stat().st_size > MAX_OG_BYTES:
        img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    size = path.stat().st_size
    print(f'og.png {img.width}×{img.height}, {size / 1024:.0f}KB')
    if size > MAX_OG_BYTES:
        raise SystemExit('og.png가 300KB를 넘어요')


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    browser = find_browser()
    with tempfile.TemporaryDirectory() as tmp:
        save_og(capture(browser, f'{base}/tools/og.html', 1200, 630, tmp))
        capture(browser, f'{base}/tools/icon.html', 180, 180, tmp).save(ROOT / 'apple-touch-icon.png', optimize=True)
        print('apple-touch-icon.png 180×180')
    server.shutdown()


if __name__ == '__main__':
    main()
