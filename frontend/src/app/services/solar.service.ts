import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface PanelArray {
    panels:  number;
    wp:      number;
    tilt:    number;
    azimuth: number;
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
    arrays:    Array<PanelArray & { total_wp: number }>;
    total_wp:  number;
    days:      SolarDay[];
}

export interface SolarConfig {
    arrays:     PanelArray[];
    efficiency: number;
    lat:        number;
    lon:        number;
    maxAcW:     number;
}

@Injectable({ providedIn: 'root' })
export class SolarService {
    constructor(private http: HttpClient) {}

    getTomorrow(cfg: SolarConfig): Observable<SolarForecast> {
        const params: any = {
            lat:        cfg.lat,
            lon:        cfg.lon,
            efficiency: cfg.efficiency,
            maxAcW:     cfg.maxAcW,
            arrays:     JSON.stringify(cfg.arrays),
        };
        return this.http.get<SolarForecast>(`${environment.apiUrl}/solar/tomorrow`, { params });
    }
}
