import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { RadarGridInfo } from 'src/app/utils/radar-grid.util';

export type RadarGridSet = 'precip' | 'echotop' | 'hail';

export interface RadarGridFrame {
    ts: string;         // ISO, UTC, e.g. 2026-10-13T14:10:00Z
    v: number;          // when the backend stored it (ms): part of the frame URL
    size: number;       // bytes of the stored document: a bigger one means more rain (used for the rain strip)
}

export interface RadarGridForecast {
    run: string;                    // the time of the run the forecast belongs to
    frames: RadarGridFrame[];       // +5 ... +120 minutes
}

export interface RadarGridFrames {
    set: RadarGridSet;
    grid: RadarGridInfo | null;     // null while the set is still empty
    newest: string | null;
    oldest: string | null;
    frames: RadarGridFrame[];       // empty without a range
    forecast?: RadarGridForecast | null;    // only when asked for (precipitation): null = no current forecast
}

export interface RadarGridDay {
    date: string;       // yyyy-mm-dd (Europe/Amsterdam)
    count: number;
    first: string;
    last: string;
}

// A frame in the shape the radar page works with (made from the grid frames by RainRadarMapComponent.gridFrames$)
export interface RadarFrame {
    time: string;       // ISO, UTC, e.g. 2026-10-13T14:10:00Z
    file: string;       // set|time: identifies the frame
    v: number;          // time the backend stored it (ms) - changes when the frame is rewritten
    size: number;       // bytes of the stored frame: a bigger one means more rain (used for the rain strip)
    observed: boolean;  // true = radar observation, false = forecast
}

export interface RadarFrameInfo {
    referenceTime: string | null;                   // time of the newest observation = "now"
    bounds: [[number, number], [number, number]];   // [[south, west], [north, east]]
    historyDays: number;                            // how long the backend keeps frames
    oldest: string | null;
    frames: RadarFrame[];
}

export interface RadarDay {
    date: string;       // yyyy-mm-dd (Europe/Amsterdam)
    count: number;      // frames of that day (a full day has 288)
    first: string;
    last: string;
}

// The radar grids that weather-maps keeps in MongoDB (backend/routes/radargrid.route.js, docs/radar-grids.md)
@Injectable({ providedIn: 'root' })
export class RadarGridService {
    private apiUrl = environment.apiUrl;
    constructor(private http: HttpClient) {}

    // from/to = ISO UTC strings, at most 2 days apart
    getFrames(set: RadarGridSet, range?: { from: string; to: string }, forecast = false): Observable<RadarGridFrames> {
        let params = new HttpParams().set('set', set);
        if (range) params = params.set('from', range.from).set('to', range.to);
        if (forecast) params = params.set('forecast', '1');
        return this.http.get<RadarGridFrames>(`${this.apiUrl}/radar-grid/frames`, { params });
    }

    getDays(set: RadarGridSet): Observable<{ days: RadarGridDay[] }> {
        return this.http.get<{ days: RadarGridDay[] }>(`${this.apiUrl}/radar-grid/days`, { params: new HttpParams().set('set', set) });
    }

    // The zlib bytes of one grid; inflateGrid() in utils/radar-grid.util.ts turns them into codes
    getFrame(set: RadarGridSet, frame: { ts: string; v: number }, forecast = false): Observable<ArrayBuffer> {
        let params = new HttpParams().set('set', set).set('ts', frame.ts).set('v', String(frame.v));
        if (forecast) params = params.set('forecast', '1');
        return this.http.get(`${this.apiUrl}/radar-grid/frame`, { params, responseType: 'arraybuffer' });
    }
}
