import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type InverterType = 'string' | 'micro';

export interface PanelArray {
    panels:  number;
    wp:      number;
    tilt:    number;
    azimuth: number;
}

export interface Inverter {
    name:   string;
    type:   InverterType;
    maxAcW: number;
    arrays: PanelArray[];
}

export interface SolarHour {
    hour:      number;
    gti_wm2:   number | null;
    power_w:   number;
    energy_wh: number;
    temp_c:    number | null;
    cloud_pct: number | null;
}

export interface SolarDay {
    date:      string;
    total_kwh: number;
    total_wh:  number;
    hourly:    SolarHour[];
}

export interface SolarForecast {
    location:  { lat: number; lon: number };
    total_wp:  number;
    days:      SolarDay[];
}

export interface SolarConfig {
    inverters:  Inverter[];
    efficiency: number;
    lat:        number;
    lon:        number;
}

@Injectable({ providedIn: 'root' })
export class SolarService {
    constructor(private http: HttpClient) {}

    getTomorrow(cfg: SolarConfig): Observable<SolarForecast> {
        const params: any = {
            lat:        cfg.lat,
            lon:        cfg.lon,
            efficiency: cfg.efficiency,
            inverters:  JSON.stringify(cfg.inverters),
        };
        return this.http.get<SolarForecast>(`${environment.apiUrl}/solar/tomorrow`, { params });
    }
}
