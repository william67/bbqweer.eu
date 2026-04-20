import { Injectable } from '@angular/core';

export interface PlanetInfo {
    name: string;
    ra: number;
    dec: number;
    color: string;
    sizePx: number;
}

interface OrbitalElem {
    L0: number; Ldot: number; a: number; e: number;
    i: number; Omega: number; omega: number;
}

@Injectable({ providedIn: 'root' })
export class PlanetariumCalcService {

    private toRad(deg: number): number { return deg * Math.PI / 180; }
    private toDeg(rad: number): number { return rad * 180 / Math.PI; }

    getJulianDay(date: Date): number {
        const y = date.getUTCFullYear();
        const m = date.getUTCMonth() + 1;
        const d = date.getUTCDate()
                + date.getUTCHours()   / 24
                + date.getUTCMinutes() / 1440
                + date.getUTCSeconds() / 86400;
        const A = Math.floor(y / 100);
        const B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (y + 4716))
             + Math.floor(30.6001 * (m + 1))
             + d + B - 1524.5;
    }

    getLST(date: Date, longitude: number): number {
        const JD = this.getJulianDay(date);
        let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0);
        GMST = ((GMST % 360) + 360) % 360;
        return ((GMST + longitude) % 360 + 360) % 360;
    }

    raDecToAltAz(ra: number, dec: number, lst: number, lat: number): { alt: number; az: number } {
        const HA     = this.toRad(((lst - ra * 15) % 360 + 360) % 360);
        const latRad = this.toRad(lat);
        const decRad = this.toRad(dec);

        const sinAlt = Math.sin(decRad) * Math.sin(latRad)
                     + Math.cos(decRad) * Math.cos(latRad) * Math.cos(HA);
        const alt = this.toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

        const cosAz = (Math.sin(decRad) - Math.sin(this.toRad(alt)) * Math.sin(latRad))
                    / (Math.cos(this.toRad(alt)) * Math.cos(latRad));
        let az = this.toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
        if (Math.sin(HA) > 0) az = 360 - az;

        return { alt, az };
    }

    project(alt: number, az: number, cx: number, cy: number, radius: number): { x: number; y: number } | null {
        if (alt < 0) return null;
        const r     = (1 - alt / 90) * radius;
        const azRad = this.toRad(az);
        return { x: cx - r * Math.sin(azRad), y: cy - r * Math.cos(azRad) };
    }

    getSunPosition(date: Date): { ra: number; dec: number } {
        const n = this.getJulianDay(date) - 2451545.0;
        const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
        const g = this.toRad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);
        const lambda = this.toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
        const eps = this.toRad(23.439 - 0.0000004 * n);
        const ra  = ((this.toDeg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))) / 15) % 24 + 24) % 24;
        const dec = this.toDeg(Math.asin(Math.sin(eps) * Math.sin(lambda)));
        return { ra, dec };
    }

    getMoonPosition(date: Date): { ra: number; dec: number; phase: number; waxing: boolean } {
        const n  = this.getJulianDay(date) - 2451545.0;
        const Lm = this.toRad(((218.316 + 13.176396 * n) % 360 + 360) % 360);
        const M  = this.toRad(((134.963 + 13.064993 * n) % 360 + 360) % 360);
        const F  = this.toRad(((93.272  + 13.229350 * n) % 360 + 360) % 360);
        const lambda = Lm + this.toRad(6.289 * Math.sin(M));
        const beta   = this.toRad(5.128 * Math.sin(F));
        const eps    = this.toRad(23.439 - 0.0000004 * n);
        const ra  = ((this.toDeg(Math.atan2(
            Math.cos(eps) * Math.sin(lambda) - Math.tan(beta) * Math.sin(eps),
            Math.cos(lambda)
        )) / 15) % 24 + 24) % 24;
        const dec = this.toDeg(Math.asin(
            Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda)
        ));
        const D = this.toRad(((297.85 + 12.190749 * n) % 360 + 360) % 360);
        return { ra, dec, phase: 0.5 * (1 - Math.cos(D)), waxing: D < Math.PI };
    }

    getPlanetPositions(date: Date): PlanetInfo[] {
        const T = (this.getJulianDay(date) - 2451545.0) / 36525.0;

        const defs: { name: string; el: OrbitalElem; color: string; sizePx: number }[] = [
            { name: 'Mercury', color: '#b0a090', sizePx: 3, el: { L0: 252.250906, Ldot: 149472.6746358, a: 0.38709893, e: 0.20563069, i: 7.00487,  Omega: 48.33167,  omega: 77.45645  } },
            { name: 'Venus',   color: '#fffce0', sizePx: 5, el: { L0: 181.979801, Ldot:  58517.8156760, a: 0.72333199, e: 0.00677323, i: 3.39471,  Omega: 76.68069,  omega: 131.53298 } },
            { name: 'Mars',    color: '#e06030', sizePx: 4, el: { L0: 355.433275, Ldot:  19140.2993313, a: 1.52366231, e: 0.09341233, i: 1.85061,  Omega: 49.57854,  omega: 336.04084 } },
            { name: 'Jupiter', color: '#e8d8a0', sizePx: 6, el: { L0:  34.351484, Ldot:   3034.9056746, a: 5.20336301, e: 0.04839266, i: 1.30530,  Omega: 100.55615, omega: 14.75385  } },
            { name: 'Saturn',  color: '#e8d090', sizePx: 5, el: { L0:  50.077471, Ldot:   1222.1137943, a: 9.53707032, e: 0.05415060, i: 2.48446,  Omega: 113.71504, omega: 92.43194  } },
            { name: 'Uranus',  color: '#b0e0f0', sizePx: 3, el: { L0: 314.055005, Ldot:    428.4669983, a: 19.19126,  e: 0.04716771, i: 0.76986,  Omega: 74.22988,  omega: 170.96424 } },
            { name: 'Neptune', color: '#7090e0', sizePx: 3, el: { L0: 304.348665, Ldot:    218.4862002, a: 30.06896,  e: 0.00858587, i: 1.76917,  Omega: 131.72169, omega: 44.97135  } },
        ];
        const earthEl: OrbitalElem = { L0: 100.466457, Ldot: 35999.3728565, a: 1.000001018, e: 0.01671123, i: 0.0, Omega: 0.0, omega: 102.937348 };
        const earth = this.heliocentricXYZ(earthEl, T);
        const eps   = this.toRad(23.4392911);

        return defs.map(({ name, el, color, sizePx }) => {
            const h  = this.heliocentricXYZ(el, T);
            const dx = h.x - earth.x;
            const dy = h.y - earth.y;
            const dz = h.z - earth.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const yEq = dy * Math.cos(eps) - dz * Math.sin(eps);
            const zEq = dy * Math.sin(eps) + dz * Math.cos(eps);
            const ra  = ((this.toDeg(Math.atan2(yEq, dx)) / 15) % 24 + 24) % 24;
            const dec = this.toDeg(Math.asin(Math.max(-1, Math.min(1, zEq / dist))));
            return { name, ra, dec, color, sizePx };
        });
    }

    private heliocentricXYZ(el: OrbitalElem, T: number): { x: number; y: number; z: number } {
        const L       = this.toRad(((el.L0 + el.Ldot * T) % 360 + 360) % 360);
        const omegaR  = this.toRad(((el.omega) % 360 + 360) % 360);
        const OmegaR  = this.toRad(((el.Omega) % 360 + 360) % 360);
        const iR      = this.toRad(el.i);
        let M = ((L - omegaR) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
        let E = M;
        for (let k = 0; k < 5; k++) E = M + el.e * Math.sin(E);
        const v = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2), Math.sqrt(1 - el.e) * Math.cos(E / 2));
        const r = el.a * (1 - el.e * Math.cos(E));
        const u = (omegaR - OmegaR) + v;
        return {
            x: r * (Math.cos(OmegaR)*Math.cos(u) - Math.sin(OmegaR)*Math.sin(u)*Math.cos(iR)),
            y: r * (Math.sin(OmegaR)*Math.cos(u) + Math.cos(OmegaR)*Math.sin(u)*Math.cos(iR)),
            z: r * Math.sin(u) * Math.sin(iR)
        };
    }

    getStarColor(spectrum: string | null): string {
        if (!spectrum) return '#ffffff';
        switch (spectrum[0].toUpperCase()) {
            case 'O': return '#9bb0ff';
            case 'B': return '#aabfff';
            case 'A': return '#cad7ff';
            case 'F': return '#f8f7ff';
            case 'G': return '#fff4ea';
            case 'K': return '#ffd2a1';
            case 'M': return '#ffcc6f';
            default:  return '#ffffff';
        }
    }

    getStarRadius(mag: number): number {
        if (mag < 0) return 4.5;
        if (mag < 1) return 3.5;
        if (mag < 2) return 2.5;
        if (mag < 3) return 2.0;
        if (mag < 4) return 1.5;
        if (mag < 5) return 1.0;
        return 0.7;
    }
}
