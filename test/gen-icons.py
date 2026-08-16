#!/usr/bin/env python3
# Génère les icônes PWA de BotDev (PNG, sans dépendance externe)
import struct, zlib, math, os

def lerp(a, b, t):
    return a + (b - a) * t

def rounded_rect_sdf(px, py, cx, cy, w, h, r):
    # distance signée à un rectangle arrondi (négatif = à l'intérieur)
    dx = abs(px - cx) - (w / 2 - r)
    dy = abs(py - cy) - (h / 2 - r)
    ax = max(dx, 0.0); ay = max(dy, 0.0)
    outside = math.hypot(ax, ay)
    inside = min(max(dx, dy), 0.0)
    return outside + inside - r

def render(size, ss):
    """ss = facteur de sur-échantillonnage pour l'antialiasing"""
    S = size * ss
    top = (88, 101, 242)      # #5865F2
    bottom = (139, 92, 246)   # #8B5CF6
    rows = []
    eye_c = [(0.335, 0.40), (0.665, 0.40)]
    eye_r = 0.095
    for y in range(S):
        row = bytearray()
        for x in range(S):
            nx, ny = x / S, y / S
            # fond : dégradé diagonal
            t = (nx + ny) / 2
            r = int(lerp(top[0], bottom[0], t))
            g = int(lerp(top[1], bottom[1], t))
            b = int(lerp(top[2], bottom[2], t))
            # yeux
            for (ex, ey) in eye_c:
                d = math.hypot(nx - ex, ny - ey)
                if d < eye_r - 0.012:
                    r, g, b = 255, 255, 255
                    break
                elif d < eye_r + 0.012:
                    a = (eye_r + 0.012 - d) / 0.024
                    r = int(lerp(r, 255, a)); g = int(lerp(g, 255, a)); b = int(lerp(b, 255, a))
            # sourire (rectangle arrondi)
            sdf = rounded_rect_sdf(nx, ny, 0.5, 0.615, 0.52, 0.17, 0.085)
            if sdf < -0.012:
                r, g, b = 255, 255, 255
            elif sdf < 0.012:
                a = (0.012 - sdf) / 0.024
                r = int(lerp(r, 255, a)); g = int(lerp(g, 255, a)); b = int(lerp(b, 255, a))
            row += bytes((r, g, b))
        rows.append(bytes(row))

    # downscale par moyenne de blocs ss×ss
    out_rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            tr = tg = tb = 0
            for dy in range(ss):
                sy = y * ss + dy
                base = x * ss * 3
                for dx in range(ss):
                    i = base + dx * 3
                    tr += rows[sy][i]; tg += rows[sy][i + 1]; tb += rows[sy][i + 2]
            n = ss * ss
            row += bytes((tr // n, tg // n, tb // n))
        out_rows.append(bytes(row))

    raw = b''.join(b'\x00' + r for r in out_rows)  # filtre 0 par ligne

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        c += struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)
        return c

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    return png

os.makedirs('public/icons', exist_ok=True)
for size, ss in [(192, 3), (512, 2)]:
    data = render(size, ss)
    with open(f'public/icons/icon-{size}.png', 'wb') as f:
        f.write(data)
    print(f'icon-{size}.png : {len(data)} octets')
print('✅ Icônes générées')
