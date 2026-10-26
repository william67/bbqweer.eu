// Pure helpers for the weather chart page: decode a stored grid and compute isobars and highs/lows from it.
// The grids come from the weather-maps service (docs/weather-charts.md): uint16 values between min and max, the high
// bytes of all values first and then the low bytes, zlib-compressed, as base64. Row 0 is the northern edge.

export interface GridField {
    nx: number; ny: number;
    lat0: number; lon0: number;          // north-west corner (grid point centre)
    dlat: number; dlon: number;          // positive spacing in degrees
    min: number; max: number;
    packed: string;                      // base64
}

export interface Extreme { x: number; y: number; val: number; type: 'H' | 'L'; }

async function inflate(b64: string): Promise<Uint8Array> {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));   // zlib format
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The values of a stored grid, row by row from the north, in the unit of the parameter (hPa, degrees C, ...). */
export async function decodeGrid(f: GridField): Promise<Float32Array> {
    const raw = await inflate(f.packed);
    const n = f.nx * f.ny;
    const k = (f.max - f.min) / 65535;
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = f.min + ((raw[i] << 8) | raw[n + i]) * k;
    return v;
}

/** A part of the grid, as grid indices (inclusive). */
export interface GridWindow { x0: number; x1: number; y0: number; y1: number; }

/** Marching squares: the line segments of one level as a flat list x1, y1, x2, y2 (grid coordinates, x east, y south). */
export function isoSegments(v: Float32Array, nx: number, ny: number, level: number, win?: GridWindow): number[] {
    const out: number[] = [];
    const lerp = (a: number, b: number) => (level - a) / (b - a);
    const xFrom = win ? Math.max(0, win.x0) : 0, xTo = win ? Math.min(nx - 1, win.x1) : nx - 1;
    const yFrom = win ? Math.max(0, win.y0) : 0, yTo = win ? Math.min(ny - 1, win.y1) : ny - 1;
    for (let y = yFrom; y < yTo; y++) {
        for (let x = xFrom; x < xTo; x++) {
            const a = v[y * nx + x], b = v[y * nx + x + 1], c = v[(y + 1) * nx + x + 1], d = v[(y + 1) * nx + x];
            const idx = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const top: [number, number] = [x + lerp(a, b), y], right: [number, number] = [x + 1, y + lerp(b, c)];
            const bottom: [number, number] = [x + lerp(d, c), y + 1], left: [number, number] = [x, y + lerp(a, d)];
            const push = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
            switch (idx) {
                case 1: case 14: push(left, bottom); break;
                case 2: case 13: push(bottom, right); break;
                case 3: case 12: push(left, right); break;
                case 4: case 11: push(top, right); break;
                case 5: { const m = (a + b + c + d) / 4; if (m >= level) { push(top, left); push(bottom, right); } else { push(top, right); push(left, bottom); } break; }
                case 6: case 9: push(top, bottom); break;
                case 7: case 8: push(top, left); break;
                case 10: { const m = (a + b + c + d) / 4; if (m >= level) { push(top, right); push(left, bottom); } else { push(top, left); push(bottom, right); } break; }
            }
        }
    }
    return out;
}

/**
 * Highs and lows: a grid point that is the lowest (L) or highest (H) value of the whole window of about `degrees` around it
 * (the window shrinks on a small domain: at most a quarter of its width and height), and that differs at least
 * `minProminence` from the mean of the window's border, so weak bumps (sea level pressure over mountains) are left out.
 * Per pressure area only the strongest point is kept: candidates are taken deepest/highest first and dropped when a
 * point of the same kind is already marked inside the window.
 */
function slideExtreme(src: Float32Array, dst: Float32Array, len: number, start: number, step: number, r: number, max: boolean, queue: Int32Array): void {
    let head = 0, tail = 0;
    for (let i = 0; i < len + r; i++) {                            // i enters the window, the window of output i - r
        if (i < len) {
            const val = src[start + i * step];
            while (tail > head) {
                const last = src[start + queue[tail - 1] * step];
                if (max ? last <= val : last >= val) tail--; else break;
            }
            queue[tail++] = i;
        }
        const o = i - r;
        if (o >= 0) {
            while (queue[head] < o - r) head++;
            dst[start + o * step] = src[start + queue[head] * step];
        }
    }
}

function windowExtreme(src: Float32Array, nx: number, ny: number, rx: number, ry: number, max: boolean): Float32Array {
    const tmp = new Float32Array(nx * ny), out = new Float32Array(nx * ny);
    const queue = new Int32Array(Math.max(nx, ny));
    for (let y = 0; y < ny; y++) slideExtreme(src, tmp, nx, y * nx, 1, rx, max, queue);
    for (let x = 0; x < nx; x++) slideExtreme(tmp, out, ny, x, nx, ry, max, queue);
    return out;
}

export function findExtremes(v: Float32Array, f: GridField, degrees = 4, minProminence = 2): Extreme[] {
    const rx = Math.max(2, Math.round(Math.min(degrees, 0.25 * (f.nx - 1) * f.dlon) / f.dlon));
    const ry = Math.max(2, Math.round(Math.min(degrees, 0.25 * (f.ny - 1) * f.dlat) / f.dlat));
    const n = f.nx * f.ny;
    let gaps = false;
    const clean = new Float32Array(n), nan = new Float32Array(n);   // NaN becomes 0 in `clean`, `nan` marks where it was
    for (let i = 0; i < n; i++) {
        if (v[i] !== v[i]) { gaps = true; nan[i] = 1; } else clean[i] = v[i];
    }
    const lo = windowExtreme(clean, f.nx, f.ny, rx, ry, false), hi = windowExtreme(clean, f.nx, f.ny, rx, ry, true);
    const bad = gaps ? windowExtreme(nan, f.nx, f.ny, rx, ry, true) : null;
    const cands: Extreme[] = [];
    for (let y = ry; y < f.ny - ry; y++) {
        for (let x = rx; x < f.nx - rx; x++) {
            const idx = y * f.nx + x, val = clean[idx];
            if (bad && bad[idx] > 0) continue;
            const isMin = val === lo[idx], isMax = val === hi[idx];
            if (!isMin && !isMax) continue;
            let sum = 0, cnt = 0;                                  // mean of the window's border (only for the few candidates)
            for (let j = -ry; j <= ry; j++) {
                for (let i = -rx; i <= rx; i += (Math.abs(j) === ry ? 1 : 2 * rx)) {
                    sum += clean[(y + j) * f.nx + x + i];
                    cnt++;
                }
            }
            const prominence = isMax ? val - sum / cnt : sum / cnt - val;
            if (prominence >= minProminence) cands.push({ x, y, val, type: isMax ? 'H' : 'L' });
        }
    }
    cands.sort((a, b) => (a.type === 'L' ? a.val : -a.val) - (b.type === 'L' ? b.val : -b.val));   // the strongest first
    const out: Extreme[] = [];
    for (const c of cands) {
        if (!out.some(o => o.type === c.type && Math.abs(o.x - c.x) <= rx && Math.abs(o.y - c.y) <= ry)) out.push(c);
    }
    return out;
}
