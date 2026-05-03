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

export interface BacktestHour {
    datum_tijd_van: string;
    datum_tijd_tot: string;
    gti_wm2:        number | null;
    ghi_wm2:   number | null;
    q_jcm2:    number | null;
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

export interface Station {
    code: number;
    name: string;
    lat:  number;
    lon:  number;
}

export interface BacktestResult {
    from:        string;
    to:          string;
    stn:         number;
    station_lat: number;
    station_lon: number;
    total_kwh:   number;
    total_wh:    number;
    hourly:      BacktestHour[];
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

    getStations(): Observable<Station[]> {
        return this.http.get<Station[]>(`${environment.apiUrl}/solar/stations`);
    }

    getBacktest(cfg: SolarConfig, stn: number, from: string, to: string): Observable<BacktestResult> {
        const params: any = {
            stn,
            from,
            to,
            efficiency: cfg.efficiency,
            inverters:  JSON.stringify(cfg.inverters),
        };
        return this.http.get<BacktestResult>(`${environment.apiUrl}/solar/backtest`, { params });
    }
}
