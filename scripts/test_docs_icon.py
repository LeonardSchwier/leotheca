"""TDD tests: macOS document icon (docs-icon.icns + rounded-square PNGs).

Covers the item "macOS document icons for `.md`": the app ships a real
document icon (rounded-square style, like Apple's text-app document icons)
that macOS shows for `.md`/`.markdown`/`.mdown` files instead of the
generic blank page.

Runs with: python3 -m unittest scripts.test_docs_icon -v
(or: python3 scripts/test_docs_icon.py)
"""
import re
import struct
import subprocess
import sys
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / 'src-tauri' / 'icons'
GEN = ROOT / 'scripts' / 'generate-docs-icon.py'

EXPECTED_SIZES = (16, 32, 64, 128, 256, 512, 1024)
ICNS_TYPES = {16: b'icp4', 32: b'icp5', 64: b'icp6',
              128: b'ic04', 256: b'ic05', 512: b'ic06', 1024: b'ic07'}


def parse_icns(path: Path) -> dict:
    """Return {pixel_size: png_bytes} for each entry in an .icns file."""
    data = path.read_bytes()
    assert data[:4] == b'icns', 'not an icns container'
    total = struct.unpack('>I', data[4:8])[0]
    assert total == len(data), f'icns header size {total} != file size {len(data)}'
    entries = {}
    i = 8
    while i < len(data):
        typ = data[i:i + 4]
        size = struct.unpack('>I', data[i + 4:i + 8])[0]
        payload = data[i + 8:i + size]
        assert payload[:8] == b'\x89PNG\r\n\x1a\n', f'{typ}: entry is not PNG'
        w, h = struct.unpack('>II', payload[16:24])
        assert w == h, f'{typ}: {w}x{h} is not square'
        entries[w] = payload
        i += size
    assert len(entries) == len(ICNS_TYPES), f'{len(entries)} entries, expected {len(ICNS_TYPES)}'
    return entries


def png_pixels(data: bytes):
    """Decode an 8-bit RGB/RGBA PNG into (w, h, channels, list-of-row-bytes)."""
    w, h = struct.unpack('>II', data[16:24])
    colortype = data[25]
    channels = 4 if colortype == 6 else 3
    idat = b''
    i = 8
    while i < len(data):
        ln = struct.unpack('>I', data[i:i + 4])[0]
        if data[i + 4:i + 8] == b'IDAT':
            idat += data[i + 8:i + 8 + ln]
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * channels
    px = []
    prev = bytearray(stride)
    pos = 0
    for _ in range(h):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if f == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                upprev = prev[x - channels] if x >= channels else 0
                p = left + upprev - prev[x]
                pa, pb, pc = abs(p - left), abs(p - upprev), abs(p - prev[x])
                pr = left if (pa <= pb and pa <= pc) else (upprev if pb <= pc else prev[x])
                line[x] = (line[x] + pr) & 255
        px.append(bytes(line))
        prev = line
    return w, h, channels, px


class TestDocsIcon(unittest.TestCase):

    def test_generator_script_exists(self):
        self.assertTrue(GEN.is_file(), f'missing {GEN}')

    def test_pngs_exist_and_are_rounded_squares(self):
        for size in EXPECTED_SIZES:
            p = ICONS / f'docs-icon-{size}.png'
            self.assertTrue(p.is_file(), f'missing {p.name}')
            data = p.read_bytes()
            w, h, ch, px = png_pixels(data)
            self.assertEqual(w, size, f'{p.name}: width {w} != {size}')
            self.assertEqual(h, size, f'{p.name}: height {h} != {size}')
            self.assertEqual(ch, 4, f'{p.name}: expected RGBA, got {ch} channels')
            center = size // 2
            corner_alpha = px[0][0 * ch + 3]
            self.assertLess(corner_alpha, 40,
                            f'{p.name}: corner alpha {corner_alpha} not transparent')
            center_alpha = px[center][center * ch + 3]
            self.assertGreater(center_alpha, 200,
                               f'{p.name}: center alpha {center_alpha} not opaque')
            for (ex, ey) in ((0, center), (size - 1, center), (center, 0), (center, size - 1)):
                edge_alpha = px[ey][ex * ch + 3]
                self.assertGreater(edge_alpha, 150,
                                   f'{p.name}: edge ({ex},{ey}) alpha {edge_alpha} cut away')

    def test_icns_container(self):
        icns = ICONS / 'docs-icon.icns'
        self.assertTrue(icns.is_file(), 'missing docs-icon.icns')
        entries = parse_icns(icns)
        for size, typ in ICNS_TYPES.items():
            self.assertIn(size, entries, f'missing {size}px entry ({typ})')
            data = entries[size]
            w, h = struct.unpack('>II', data[16:24])
            self.assertEqual(w, size)
            self.assertEqual(h, size)
            png_pixels(data)  # must decode

    def test_macos_bundle_uses_the_icon(self):
        bundle_info = ROOT / 'packaging' / 'macos' / 'app' / 'Info.plist'
        self.assertTrue(bundle_info.is_file(), 'missing packaging/macos/app/Info.plist')
        text = bundle_info.read_text(encoding='utf-8')
        self.assertIn('CFBundleDocumentTypes', text)
        self.assertRegex(text, r'<string>\s*md\s*</string>')
        self.assertIn('docs-icon', text)

    def test_ci_wires_icon_into_dmg_and_app(self):
        wf = (ROOT / '.github' / 'workflows' / 'release.yml').read_text(encoding='utf-8')
        macos_job = wf[wf.index('  macos:'):]
        win_idx = macos_job.find('  windows:')
        macos_job = macos_job[:win_idx] if win_idx != -1 else macos_job
        self.assertIn('docs-icon.icns', macos_job,
                      'release.yml macos job does not use docs-icon.icns')
        self.assertIn('Info.plist', macos_job,
                      'release.yml macos job does not patch Info.plist')

    def test_generator_is_deterministic_and_reproducible(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'icons'
            for run in range(2):
                r = subprocess.run(
                    [sys.executable, str(GEN), '--out', str(out)],
                    capture_output=True, text=True, cwd=ROOT)
                self.assertEqual(r.returncode, 0, r.stderr)
            a1 = (out / 'docs-icon.icns').read_bytes()
            (out / 'docs-icon.icns').unlink()
            subprocess.run([sys.executable, str(GEN), '--out', str(out)],
                           capture_output=True, text=True, cwd=ROOT, check=True)
            a2 = (out / 'docs-icon.icns').read_bytes()
            self.assertEqual(a1, a2, 'generator is not deterministic')

    def test_quicklook_still_declares_markdown(self):
        ql = (ROOT / 'packaging' / 'macos' / 'quicklook' / 'Info.plist').read_text(encoding='utf-8')
        self.assertIn('markdown', ql)
        self.assertIn('LSHandlerRank', ql)


if __name__ == '__main__':
    unittest.main(verbosity=2)
