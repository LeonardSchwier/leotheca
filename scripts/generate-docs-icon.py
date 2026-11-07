#!/usr/bin/env python3
"""Generate macOS document icons (rounded-square style) from the app icon.

Produces src-tauri/icons/docs-icon-<size>.png (16..1024) and a
src-tauri/icons/docs-icon.icns container (icp4/5/6 + ic04/5/6/7).

Pure stdlib: reads the RGBA source PNG, box-averages it into a rounded
square with anti-aliased corners, and writes fresh PNGs + an ICNS file.
Deterministic, no external dependencies, runs on Linux CI.
"""
import struct
import sys
import zlib
from pathlib import Path


def read_png(path: Path):
    d = path.read_bytes()
    w, h = struct.unpack('>II', d[16:24])
    bitdepth, colortype = d[24], d[25]
    assert bitdepth == 8 and colortype in (2, 6), (bitdepth, colortype)
    channels = 4 if colortype == 6 else 3
    bpp = channels
    i = 8
    idat = b''
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        if typ == b'IDAT':
            idat += d[i + 8:i + 8 + ln]
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * bpp
    px = []
    prev = bytearray(stride)
    pos = 0
    for _ in range(h):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                upprev = prev[x - bpp] if x >= bpp else 0
                p = left + upprev - prev[x]
                pa, pb, pc = abs(p - left), abs(p - upprev), abs(p - prev[x])
                pr = left if (pa <= pb and pa <= pc) else (upprev if pb <= pc else prev[x])
                line[x] = (line[x] + pr) & 255
        px.append(bytes(line))
        prev = line
    return w, h, px, channels


def png_to_icns_entry(name: str, w: int, h: int, channels: int, rows):
    """Encode one icon entry as (icns-type, pixel-size, png-bytes)."""
    colortype = 6 if channels == 4 else 2
    raw = bytearray()
    for row in rows:
        raw.append(0)
        raw.extend(row)
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ: bytes, data: bytes) -> bytes:
        c = typ + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    out = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, colortype, 0, 0, 0))
           + chunk(b'IDAT', comp)
           + chunk(b'IEND', b''))
    return name, w, out


def png_to_file(path: Path, w: int, h: int, channels: int, rows) -> None:
    _, _, data = png_to_icns_entry('png', w, h, channels, rows)
    path.write_bytes(data)


def _get_row(px, base, x, ch):
    """Return a list of ints for the pixel at (row-base) x."""
    o = base + x * ch
    return [px[o + i] for i in range(ch)]


def make_rounded(src_w: int, src_h: int, src_px, src_ch, canvas: int,
                 radius_frac: float = 0.2237, pad_frac: float = 0.10):
    """Render the source icon onto a white rounded square.

    The app icon is centered with padding so the rounded square reads as a
    document tile. Corner alpha is anti-aliased over a 1px band.
    """
    import math
    pad = max(1, int(canvas * pad_frac))
    icon = canvas - 2 * pad
    bw, bh = src_w / icon, src_h / icon
    icon_rows = []
    for y in range(icon):
        row = bytearray()
        for x in range(icon):
            x0, x1 = int(x * bw), max(int(x * bw) + 1, int((x + 1) * bw))
            y0, y1 = int(y * bh), max(int(y * bh) + 1, int((y + 1) * bh))
            acc = [0.0] * src_ch
            n = 0
            for yy in range(y0, y1):
                row_bytes = src_px[yy]
                for xx in range(x0, x1):
                    o = xx * src_ch
                    for i in range(src_ch):
                        acc[i] += row_bytes[o + i]
                    n += 1
            row.extend(int(round(a / n)) for a in acc)
        icon_rows.append(bytes(row))

    radius = int(canvas * radius_frac)
    out = []
    for y in range(canvas):
        row = bytearray()
        for x in range(canvas):
            cx = min(max(x + 0.5, radius), canvas - radius)
            cy = min(max(y + 0.5, radius), canvas - radius)
            dist = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if dist <= radius - 0.5:
                a = 1.0
            elif dist >= radius + 0.5:
                a = 0.0
            else:
                a = radius + 0.5 - dist
            ix, iy = x - pad, y - pad
            if 0 <= ix < icon and 0 <= iy < icon:
                o = iy * icon * src_ch + ix * src_ch
                r, g, b = icon_rows[iy][ix * src_ch:ix * src_ch + 3]
                if src_ch == 4:
                    al = icon_rows[iy][ix * src_ch + 3]
                    ac = al / 255
                    r = r * ac + 255 * (1 - ac)
                    g = g * ac + 255 * (1 - ac)
                    b = b * ac + 255 * (1 - ac)
            else:
                r = g = b = 255
            row.extend((int(r), int(g), int(b), int(255 * a)))
        out.append(bytes(row))
    return canvas, out


ICNS_TYPES = {16: b'icp4', 32: b'icp5', 64: b'icp6',
              128: b'ic04', 256: b'ic05', 512: b'ic06', 1024: b'ic07'}
EXPECTED_SIZES = tuple(ICNS_TYPES)


def build(out_dir: Path, src: Path) -> None:
    src_w, src_h, src_px, src_ch = read_png(src)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for size in EXPECTED_SIZES:
        canvas, rows = make_rounded(src_w, src_h, src_px, src_ch, size)
        png = png_to_icns_entry(f'{size}', canvas, canvas, 4, rows)[2]
        png_to_file(out_dir / f'docs-icon-{size}.png', canvas, canvas, 4, rows)
        entries.append((ICNS_TYPES[size], size, png))
    body = b''.join(struct.pack('>4sI', t, 8 + len(d)) + d for t, _, d in entries)
    header = b'icns' + struct.pack('>I', 8 + len(body))
    (out_dir / 'docs-icon.icns').write_bytes(header + body)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='Build macOS document icons from the app icon')
    ap.add_argument('--out', default=None, help='output directory (default: <repo>/src-tauri/icons)')
    ap.add_argument('--src', default=None, help='source app icon (default: <repo>/src-tauri/icons/icon.png)')
    ns = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    out = Path(ns.out) if ns.out else root / 'src-tauri' / 'icons'
    src = Path(ns.src) if ns.src else root / 'src-tauri' / 'icons' / 'icon.png'
    build(out, src)
    print(f'built {out.name}/docs-icon.icns + {len(EXPECTED_SIZES)} PNGs')
