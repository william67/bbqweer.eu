// GET /api/weather-maps/models and /field (backend/routes/weathermaps.route.js)

export interface WeatherMapRun {
    run:    string;             // ISO, the start of the run (UTC)
    steps:  number[];           // forecast hours that are stored
    params: string[];
}

// One point of the merged timeline: for this valid time use this run and step
export interface WeatherMapFrame {
    valid: string;              // ISO, run + step hours
    run:   string;
    step:  number;
}

export interface WeatherMapModel {
    id:        string;          // "<model>/<grid>"
    model:     string;          // ecmwf | gfs | icon-eu | harmonie
    grid:      string;          // resolution in degrees, e.g. "0.25"
    run:       string;          // ISO, the newest complete run
    params:    string[];        // msl, t2m, u10, v10, precip, gust, prate (GFS and ECMWF only)
    fetchedAt: string | null;
    runs:      WeatherMapRun[]; // the complete runs, newest first (each stored apart)
    timeline:  WeatherMapFrame[]; // the runs merged: the newest run for its whole range, an older run only after it
}

export interface WeatherMapField {
    model: string; grid: string; run: string; step: number; param: string; units: string;
    nx: number; ny: number; lat0: number; lon0: number; dlat: number; dlon: number;
    min: number; max: number;
    packed: string;             // base64, see utils/isobars.util.ts
}
