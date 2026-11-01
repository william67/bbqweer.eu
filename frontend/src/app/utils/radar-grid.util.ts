// Radar grids of the KNMI Open Data API (docs/radar-grids.md): 765 rows x 700 columns of 1 x 1 km in a polar stereographic
// projection (+proj=stere +lat_0=90 +lon_0=0 +lat_ts=60, a = 6378.14 km, b = 6356.75 km). Row 0 is the northern edge; the
// upper-left corner of the grid is x = 0 km, y = -3650 km. Leaflet draws in Mercator, so the grid is resampled once into a
// look-up table (for every pixel of a Mercator image: the grid cell below it) and every frame is then painted through that table.
// Pure functions, no Angular: the same code can run in node for a check.

export interface RadarGridInfo {
    rows: number;
    cols: number;
    dtype: 'uint8' | 'uint16';
    enc: string;                // 'zlib'
    scale: number;              // value = code * scale + offset
    offset: number;
    nodata: number[];           // codes without a value
    units: string;              // 'mm/5min' for precip
}

export type LatLngBoundsTuple = [[number, number], [number, number]];      // [[south, west], [north, east]]

// Covers the whole grid: its corners lie at 48.895-55.974 N and 0-10.856 E
export const RADAR_GRID_BOUNDS: LatLngBoundsTuple = [[48.85, -0.05], [56.0, 10.9]];

const RAD = Math.PI / 180;
const A = 6378.14;
const B = 6356.75;
const E = Math.sqrt(1 - (B / A) ** 2);
const GRID_X0 = 0;
const GRID_Y0 = -3650;

const tFn = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2);
const PHI_TS = 60 * RAD;
const K = A * (Math.cos(PHI_TS) / Math.sqrt(1 - E * E * Math.sin(PHI_TS) ** 2)) / tFn(PHI_TS);

// Position of a point in the grid, in km from the pole's projection origin
export function stereo(lat: number, lon: number): { x: number; y: number } {
    const rho = K * tFn(lat * RAD);
    const lam = lon * RAD;
    return { x: rho * Math.sin(lam), y: -rho * Math.cos(lam) };
}

// Index (row * cols + col) of the cell that holds a point, or -1 outside the grid
export function gridCell(lat: number, lon: number, rows: number, cols: number): number {
    const { x, y } = stereo(lat, lon);
    const col = Math.floor(x - GRID_X0);
    const row = Math.floor(GRID_Y0 - y);
    return col < 0 || col >= cols || row < 0 || row >= rows ? -1 : row * cols + col;
}

export interface GridLookup {
    width: number;
    height: number;
    index: Int32Array;          // per pixel (row-major, north first): grid cell index or -1
}

const mercY = (latDeg: number) => Math.log(Math.tan(Math.PI / 4 + latDeg * RAD / 2));

// Image of `width` pixels over `bounds` in Mercator (what L.imageOverlay stretches over the bounds)
export function buildLookup(rows: number, cols: number, bounds: LatLngBoundsTuple = RADAR_GRID_BOUNDS, width = 1024): GridLookup {
    const [[south, west], [north, east]] = bounds;
    const yTop = mercY(north);
    const yBottom = mercY(south);
    const height = Math.round(width * (yTop - yBottom) / ((east - west) * RAD));

    // per column: sin / cos of the longitude; per row: rho of the latitude (x = rho sin, y = -rho cos)
    const sinLam = new Float64Array(width);
    const cosLam = new Float64Array(width);
    for (let i = 0; i < width; i++) {
        const lam = (west + (i + 0.5) / width * (east - west)) * RAD;
        sinLam[i] = Math.sin(lam);
        cosLam[i] = Math.cos(lam);
    }
    const index = new Int32Array(width * height);
    for (let j = 0; j < height; j++) {
        const yM = yTop - (j + 0.5) / height * (yTop - yBottom);
        const phi = 2 * Math.atan(Math.exp(yM)) - Math.PI / 2;
        const rho = K * tFn(phi);
        for (let i = 0; i < width; i++) {
            const x = rho * sinLam[i];
            const y = -rho * cosLam[i];
            const col = Math.floor(x - GRID_X0);
            const row = Math.floor(GRID_Y0 - y);
            index[j * width + i] = col < 0 || col >= cols || row < 0 || row >= rows ? -1 : row * cols + col;
        }
    }
    return { width, height, index };
}

// zlib bytes of a stored frame -> codes (little-endian uint16 for precipitation, uint8 for echo top and hail)
export async function inflateGrid(buffer: ArrayBuffer, dtype: 'uint8' | 'uint16'): Promise<Uint8Array | Uint16Array> {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'));   // zlib format
    const out = await new Response(stream).arrayBuffer();
    return dtype === 'uint16' ? new Uint16Array(out) : new Uint8Array(out);
}

// ---- the layers: for each set its own colour scale and the way a code becomes the value that the scale is about

export type GridSet = 'precip' | 'echotop' | 'hail';

export interface ValueClass { min: number; color: string; label: string }

export interface GridLayerDef {
    title: string;                                          // title of the legend
    classes: ValueClass[];                                  // from `min` (inclusive) up to the next class
    value(code: number, info: RadarGridInfo): number;       // the value of a code, in the unit of the title
}

const cls = (min: number, color: string): ValueClass => ({ min, color, label: String(min) });

// Precipitation: mm per hour (the +0 frames hold mm per 5 minutes, x 12)
export const PRECIP_CLASSES: ValueClass[] = [
    cls(0.1, '#6aa6ff'), cls(0.5, '#3d82f0'), cls(1, '#1c6dd0'), cls(2, '#0b3d91'),     // the first two are darker than they look nice: over the sea (light blue) the lightest drizzle must still show
    cls(5, '#ffd400'), cls(10, '#ff8800'), cls(20, '#e00000'), cls(50, '#a00070')
];

// Echo top: km, a turbo-like scale (low = blue, a thunderstorm tower = dark red). Below 1 km is mostly clutter, so not painted.
export const ECHOTOP_CLASSES: ValueClass[] = [
    cls(1, '#4662d7'), cls(2, '#36aaf9'), cls(3, '#1ae4b6'), cls(4, '#72fe5e'), cls(6, '#c7ef34'),
    cls(8, '#faba39'), cls(10, '#f66b19'), cls(12, '#cb2a04'), cls(14, '#a31201'), cls(16, '#7a0403')
];

// Hail probability: %, from pale yellow to dark red
export const HAIL_CLASSES: ValueClass[] = [
    cls(1, '#fff3b0'), cls(20, '#ffb703'), cls(40, '#fb5607'), cls(60, '#d00000'), cls(80, '#6a040f')
];

export const GRID_LAYERS: Record<GridSet, GridLayerDef> = {
    precip: { title: 'Precipitation (mm/h)', classes: PRECIP_CLASSES, value: (code, info) => code * info.scale * 12 },
    echotop: { title: 'Echo top (km)', classes: ECHOTOP_CLASSES, value: (code, info) => code * info.scale + info.offset },
    hail: { title: 'Hail probability (%)', classes: HAIL_CLASSES, value: (code, info) => code * info.scale + info.offset }
};

// Colour per code as one 32-bit pixel (little-endian RGBA); code 0 and the nodata codes are transparent
export function gridColorTable(set: GridSet, info: RadarGridInfo): Uint32Array {
    const def = GRID_LAYERS[set];
    const size = info.dtype === 'uint16' ? 65536 : 256;
    const rgb = def.classes.map(c => {
        const n = parseInt(c.color.slice(1), 16);
        return ((255 << 24) | ((n & 0xff) << 16) | (((n >> 8) & 0xff) << 8) | ((n >> 16) & 0xff)) >>> 0;
    });
    const table = new Uint32Array(size);
    for (let code = 1; code < size; code++) {
        if (info.nodata.includes(code)) continue;
        const v = def.value(code, info);
        let k = -1;
        for (let n = 0; n < def.classes.length; n++) if (v >= def.classes[n].min) k = n;
        if (k >= 0) table[code] = rgb[k];
    }
    return table;
}

// Paints one frame onto a canvas of the size of the look-up table
export function renderGrid(codes: ArrayLike<number>, lookup: GridLookup, table: Uint32Array, canvas: HTMLCanvasElement) {
    canvas.width = lookup.width;
    canvas.height = lookup.height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(lookup.width, lookup.height);
    const px = new Uint32Array(img.data.buffer);
    const index = lookup.index;
    for (let k = 0; k < index.length; k++) {
        const s = index[k];
        px[k] = s < 0 ? 0 : table[codes[s]];
    }
    ctx.putImageData(img, 0, 0);
}

// The code at a point, or null outside the grid
export function codeAt(codes: ArrayLike<number>, lat: number, lon: number, info: RadarGridInfo): number | null {
    const cell = gridCell(lat, lon, info.rows, info.cols);
    return cell < 0 ? null : codes[cell];
}
