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

// Precipitation per hour: the amount that fell since the previous step divided by the hours between them, or the rate at the step.
// Rain in mm per hour in the colours of a rain radar; when the run knows the type (`ptype`, see below) snow is shown in cm per hour
// in purple, mix (wet snow) in pink and freezing rain in red, so rain no longer uses violet.
export interface RainBand { min: number; rgb: [number, number, number]; alpha: number; }
export const RAIN_BANDS: RainBand[] = [
    { min: 0.1, rgb: [191, 219, 254], alpha: 150 },
    { min: 0.5, rgb: [96, 165, 250],  alpha: 170 },
    { min: 1,   rgb: [37, 99, 235],   alpha: 180 },
    { min: 2,   rgb: [34, 197, 94],   alpha: 190 },
    { min: 5,   rgb: [250, 204, 21],  alpha: 200 },
    { min: 10,  rgb: [249, 115, 22],  alpha: 210 },
    { min: 20,  rgb: [220, 38, 38],   alpha: 220 },
];

// Snow: the models give the water of the snow (mm); 1 mm of water is about 1 cm of snow at a ratio of 10 : 1 (it is 6 to 8 : 1 for wet
// snow near 0 degrees and 12 to 15 : 1 for dry snow at -5 to -10 degrees, so this is a rule of thumb)
export const SNOW_RATIO = 10;
export const SNOW_CM_PER_MM = SNOW_RATIO / 10;
export const SNOW_BANDS: RainBand[] = [          // cm per hour
    { min: 0.1, rgb: [233, 213, 255], alpha: 170 },
    { min: 0.5, rgb: [216, 180, 254], alpha: 180 },
    { min: 1,   rgb: [192, 132, 252], alpha: 190 },
    { min: 2,   rgb: [168, 85, 247],  alpha: 200 },
    { min: 4,   rgb: [126, 34, 206],  alpha: 210 },
    { min: 8,   rgb: [88, 28, 135],   alpha: 220 },
];
export const MIX_BANDS: RainBand[] = [           // mm per hour
    { min: 0.1, rgb: [251, 207, 232], alpha: 170 },
    { min: 0.5, rgb: [244, 114, 182], alpha: 190 },
    { min: 2,   rgb: [219, 39, 119],  alpha: 205 },
    { min: 5,   rgb: [157, 23, 77],   alpha: 215 },
];
export const FREEZING_BANDS: RainBand[] = [      // mm per hour
    { min: 0.1, rgb: [248, 90, 90],   alpha: 190 },
    { min: 0.5, rgb: [232, 36, 36],   alpha: 205 },
    { min: 2,   rgb: [200, 16, 16],   alpha: 215 },
    { min: 5,   rgb: [140, 8, 8],     alpha: 225 },
];

function bandColour(bands: RainBand[], v: number): Rgba | null {
    let hit: RainBand | null = null;
    for (const b of bands) if (v >= b.min) hit = b;
    return hit ? [hit.rgb[0], hit.rgb[1], hit.rgb[2], hit.alpha] : null;
}

export function rainColour(mmPerHour: number): Rgba | null {
    return bandColour(RAIN_BANDS, mmPerHour);
}

// The precipitation type of a run (`ptype`): the same classes for every source, made in the sync
export const PRECIP_NAMES: Record<number, string> = { 1: 'Regen', 2: 'Natte sneeuw', 3: 'Sneeuw', 4: 'IJzel' };

// buildColourImage gets one number per point, so the class and the water in mm per hour travel together: class * 1000 + mm per hour
export const encodePrecip = (cls: number, mmPerHour: number): number => cls * 1000 + Math.min(mmPerHour, 999);

export function precipColour(code: number): Rgba | null {
    const cls = Math.floor(code / 1000), mm = code - cls * 1000;
    if (cls === 3) return bandColour(SNOW_BANDS, mm * SNOW_CM_PER_MM);
    if (cls === 2) return bandColour(MIX_BANDS, mm);
    if (cls === 4) return bandColour(FREEZING_BANDS, mm);
    return bandColour(RAIN_BANDS, mm);
}
