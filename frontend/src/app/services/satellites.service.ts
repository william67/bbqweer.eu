import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { twoline2satrec, propagate, gstime,
         eciToEcf, ecfToLookAngles,
         degreesToRadians, radiansToDegrees } from './satellite-js';
import type { SatRec, EciVec3 }              from './satellite-js';

export interface SatellitePosition {
    name: string;
    satnum: string;
    alt: number;
    az: number;
    heightKm: number;
    speedKms: number;
}

export interface PassInfo {
    name: string;
    satnum: string;
    riseTime: Date;
    riseAz: number;
    maxAlt: number;
    maxAltTime: Date;
    setTime: Date;
    setAz: number;
    durationMin: number;
}

@Injectable({ providedIn: 'root' })
export class SatellitesService {

    private records: { name: string; satrec: SatRec }[] = [];
    loaded = false;
    recordCount = 0;

    constructor(private http: HttpClient) {}

    loadTles(group?: string): void {
        let url = `${environment.apiUrl}/satellites/tle`;
        if (group) url += `?group=${encodeURIComponent(group)}`;
        this.http.get(url, { responseType: 'text' }).subscribe({
            next: text => {
                this.records = this.parseTles(text);
                this.loaded = true;
                this.recordCount = this.records.length;
            },
            error: err => console.error('[Satellites] TLE fetch failed:', err)
        });
    }

    getPositions(date: Date, lat: number, lng: number): SatellitePosition[] {
        if (!this.loaded) return [];
        const gst = gstime(date);
        const obs = {
            longitude: degreesToRadians(lng),
            latitude:  degreesToRadians(lat),
            height: 0
        };
        const positions: SatellitePosition[] = [];
        for (const { name, satrec } of this.records) {
            const pv = propagate(satrec, date);
            if (!pv.position || typeof pv.position === 'boolean') continue;
            const ecf  = eciToEcf(pv.position as EciVec3<number>, gst);
            const look = ecfToLookAngles(obs, ecf);
            const alt  = radiansToDegrees(look.elevation);
            if (alt < 0) continue;
            const az = ((radiansToDegrees(look.azimuth)) % 360 + 360) % 360;
            const satnum = String((satrec as any).satnum).trim();
            const pos = pv.position as EciVec3<number>;
            const vel = pv.velocity as EciVec3<number>;
            const heightKm = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2) - 6371;
            const speedKms = vel ? Math.sqrt(vel.x**2 + vel.y**2 + vel.z**2) : 0;
            positions.push({ name, satnum, alt, az, heightKm, speedKms });
        }
        return positions;
    }

    computePasses(from: Date, lat: number, lng: number, hours = 24, minElevation = 5): PassInfo[] {
        if (!this.loaded) return [];
        const STEP_MS  = 60_000;
        const endMs    = from.getTime() + hours * 3_600_000;
        const obs = {
            longitude: degreesToRadians(lng),
            latitude:  degreesToRadians(lat),
            height: 0
        };
        const passes: PassInfo[] = [];

        const getAltAz = (satrec: SatRec, date: Date) => {
            const gst = gstime(date);
            const pv  = propagate(satrec, date);
            if (!pv.position || typeof pv.position === 'boolean') return null;
            const ecf  = eciToEcf(pv.position as EciVec3<number>, gst);
            const look = ecfToLookAngles(obs, ecf);
            return {
                alt: radiansToDegrees(look.elevation),
                az:  ((radiansToDegrees(look.azimuth)) % 360 + 360) % 360
            };
        };

        for (const { name, satrec } of this.records) {
            const satnum = String((satrec as any).satnum).trim();
            let prevAlt = -90;
            let inPass  = false;
            let riseTime!: Date; let riseAz = 0;
            let maxAlt = 0;     let maxAltTime!: Date;

            for (let t = from.getTime(); t <= endMs + STEP_MS; t += STEP_MS) {
                const date = new Date(Math.min(t, endMs));
                const pos  = getAltAz(satrec, date);
                if (!pos) { prevAlt = -90; continue; }
                const { alt, az } = pos;

                if (!inPass && prevAlt < 0 && alt >= 0) {
                    inPass = true;
                    riseTime = date; riseAz = az;
                    maxAlt = alt;    maxAltTime = date;
                } else if (inPass) {
                    if (alt > maxAlt) { maxAlt = alt; maxAltTime = date; }
                    if (alt < 0 || t > endMs) {
                        if (maxAlt >= minElevation) {
                            passes.push({
                                name, satnum,
                                riseTime, riseAz,
                                maxAlt, maxAltTime,
                                setTime: date, setAz: az,
                                durationMin: Math.round((date.getTime() - riseTime.getTime()) / 60_000)
                            });
                        }
                        inPass = false; maxAlt = 0;
                    }
                }
                prevAlt = alt;
            }
        }

        return passes.sort((a, b) => a.riseTime.getTime() - b.riseTime.getTime());
    }

    private parseTles(text: string): { name: string; satrec: SatRec }[] {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const records: { name: string; satrec: SatRec }[] = [];
        for (let i = 0; i + 2 < lines.length; i += 3) {
            const name = lines[i];
            const tle1 = lines[i + 1];
            const tle2 = lines[i + 2];
            if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ')) continue;
            try {
                records.push({ name, satrec: twoline2satrec(tle1, tle2) });
            } catch { /* skip bad TLEs */ }
        }
        return records;
    }
}
