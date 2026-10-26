// Pure helpers for the wind layer of the weather chart page: wind speed colours, sampling a grid at any point and a
// colour image of the wind speed. The grids come from the weather-maps service (see isobars.util.ts), u10 and v10 are
// the 10 m wind components in m/s (u towards the east, v towards the north).

import { GridField } from './isobars.util';

export interface WindBand { min: number; rgb: [number, number, number]; alpha: number; }

// km/h; below the first band nothing is drawn. The 40 km/h step is force 6 on the Beaufort scale.
export const WIND_BANDS: WindBand[] = [
    { min: 20, rgb: [134, 239, 172], alpha: 120 },
    { min: 30, rgb: [253, 224, 71],  alpha: 140 },
    { min: 40, rgb: [251, 146, 60],  alpha: 150 },
    { min: 50, rgb: [239, 68, 68],   alpha: 160 },
    { min: 65, rgb: [168, 85, 247],  alpha: 170 },
    { min: 80, rgb: [109, 40, 217],  alpha: 180 },
];

export function windBand(kmh: number): WindBand | null {
    let hit: WindBand | null = null;
    for (const b of WIND_BANDS) if (kmh >= b.min) hit = b;
    return hit;
}

/** Bilinear value of a grid at a latitude and longitude; null outside the grid. */
export function sampleBilinear(v: Float32Array, f: GridField, lat: number, lon: number): number | null {
    const fx = (lon - f.lon0) / f.dlon, fy = (f.lat0 - lat) / f.dlat;
    if (fx < 0 || fy < 0 || fx > f.nx - 1 || fy > f.ny - 1) return null;
    const x0 = Math.min(Math.floor(fx), f.nx - 2), y0 = Math.min(Math.floor(fy), f.ny - 2);
    const tx = fx - x0, ty = fy - y0;
    const a = v[y0 * f.nx + x0], b = v[y0 * f.nx + x0 + 1], c = v[(y0 + 1) * f.nx + x0], d = v[(y0 + 1) * f.nx + x0 + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** The value of the nearest grid point (for classes, which must not be averaged); null outside the grid or at a point without a value. */
export function sampleNearest(v: Float32Array, f: GridField, lat: number, lon: number): number | null {
    const x = Math.round((lon - f.lon0) / f.dlon), y = Math.round((f.lat0 - lat) / f.dlat);
    if (x < 0 || y < 0 || x > f.nx - 1 || y > f.ny - 1) return null;
    const r = v[y * f.nx + x];
    return r === r ? r : null;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOfMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

export type Rgba = [number, number, number, number];

/**
 * A colour image of a field for Leaflet's imageOverlay: `value(lat, lon)` gives the value at a point (null outside the
 * grid) and `colour(value)` its colour (null = transparent). The map is Web Mercator, so the rows of the image are spaced
 * in Mercator and every pixel is sampled from the (regular lat-lon) grid; stretching the grid as it is would put the
 * colours a little off the isobars.
 */
export function buildColourImage(f: GridField, value: (lat: number, lon: number) => number | null,
                                 colour: (v: number) => Rgba | null): { url: string; bounds: [[number, number], [number, number]] } {
    const north = f.lat0, south = f.lat0 - (f.ny - 1) * f.dlat, west = f.lon0, east = f.lon0 + (f.nx - 1) * f.dlon;
    const w = Math.min(1400, f.nx * 2);
    const spanY = mercY(north) - mercY(south), spanX = ((east - west) * Math.PI) / 180;
    const h = Math.max(2, Math.round((w * spanY) / spanX));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
        const lat = latOfMercY(mercY(north) - ((j + 0.5) / h) * spanY);
        for (let i = 0; i < w; i++) {
            const v = value(lat, west + ((i + 0.5) / w) * (east - west));
            if (v === null) continue;
            const c = colour(v);
            if (!c) continue;
            const o = (j * w + i) * 4;
            img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
        }
    }
    ctx.putImageData(img, 0, 0);
    return { url: canvas.toDataURL('image/png'), bounds: [[south, west], [north, east]] };
}

/** The wind speed (or gusts) in km/h as a colour image. */
export function buildSpeedImage(f: GridField, kmh: (lat: number, lon: number) => number | null) {
    return buildColourImage(f, kmh, v => {
        const b = windBand(v);
        return b ? [b.rgb[0], b.rgb[1], b.rgb[2], b.alpha] : null;
    });
}
