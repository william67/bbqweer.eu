import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface SolarHour {
    hour:      number;
    gti_wm2:   number | null;
    power_w:   number;
    energy_wh: number;
    temp_c:    number | null;
    cloud_pct: number | null;
}

export interface SolarTomorrow {
    date:      string;
    location:  { lat: number; lon: number };
    panels:    { count: number; wp_each: number; total_wp: number; tilt: number; azimuth: number; efficiency: number };
    total_kwh: number;
    total_wh:  number;
    hourly:    SolarHour[];
}

export interface SolarConfig {
    panels:     number;
    wp:         number;
    tilt:       number;
    azimuth:    number;
    efficiency: number;
    lat:        number;
    lon:        number;
    maxAcW:     number;
}

@Injectable({ providedIn: 'root' })
export class SolarService {
    constructor(private http: HttpClient) {}

    getTomorrow(cfg: SolarConfig): Observable<SolarTomorrow> {
        return this.http.get<SolarTomorrow>(`${environment.apiUrl}/solar/tomorrow`, { params: cfg as any });
    }
}
