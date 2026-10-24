// Colour scales of the temperature and precipitation layers of the weather chart page (the wind scale is in wind.util.ts).

export type Rgba = [number, number, number, number];

// 2 m temperature in degrees C: a smooth scale between these stops (blue under zero, green and yellow for mild, red when hot)
const TEMP_STOPS: [number, [number, number, number]][] = [
    [-20, [109, 40, 217]],
    [-10, [59, 130, 246]],
    [0,   [147, 197, 253]],
    [5,   [167, 243, 208]],
    [10,  [253, 224, 71]],
    [15,  [253, 186, 116]],
    [20,  [251, 146, 60]],
    [25,  [239, 68, 68]],
    [30,  [185, 28, 28]],
    [40,  [127, 29, 29]],
];
export const TEMP_LEGEND: number[] = [-20, -10, 0, 5, 10, 15, 20, 25, 30, 35];

export function tempRgb(c: number): [number, number, number] {
    if (c <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
    for (let i = 1; i < TEMP_STOPS.length; i++) {
        const [t1, c1] = TEMP_STOPS[i];
        if (c <= t1) {
            const [t0, c0] = TEMP_STOPS[i - 1];
            const f = (c - t0) / (t1 - t0);
            return [Math.round(c0[0] + (c1[0] - c0[0]) * f), Math.round(c0[1] + (c1[1] - c0[1]) * f), Math.round(c0[2] + (c1[2] - c0[2]) * f)];
        }
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

export function tempColour(c: number): Rgba {
    const [r, g, b] = tempRgb(c);
    return [r, g, b, 150];
}

// precipitation in mm per hour (the amount that fell since the previous step, divided by the hours between them)
export interface RainBand { min: number; rgb: [number, number, number]; alpha: number; }
export const RAIN_BANDS: RainBand[] = [
    { min: 0.1, rgb: [191, 219, 254], alpha: 150 },
    { min: 0.5, rgb: [96, 165, 250],  alpha: 170 },
    { min: 1,   rgb: [37, 99, 235],   alpha: 180 },
    { min: 2,   rgb: [30, 64, 175],   alpha: 190 },
    { min: 5,   rgb: [124, 58, 237],  alpha: 200 },
    { min: 10,  rgb: [192, 38, 211],  alpha: 210 },
];

export function rainColour(mmPerHour: number): Rgba | null {
    let hit: RainBand | null = null;
    for (const b of RAIN_BANDS) if (mmPerHour >= b.min) hit = b;
    return hit ? [hit.rgb[0], hit.rgb[1], hit.rgb[2], hit.alpha] : null;
}
