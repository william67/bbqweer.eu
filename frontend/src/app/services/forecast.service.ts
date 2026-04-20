import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = 'https://api.open-meteo.com/v1/forecast';

const PARAMS = [
    'temperature_2m', 'precipitation', 'windspeed_10m', 'winddirection_10m',
    'weathercode', 'cloudcover', 'relativehumidity_2m', 'pressure_msl', 'snowfall'
].join(',');

@Injectable({ providedIn: 'root' })
export class ForecastService {
    constructor(private http: HttpClient) {}

    getForecast(lat: number, lon: number): Observable<any> {
        return this.http.get<any>(BASE, { params: {
            latitude:      lat,
            longitude:     lon,
            hourly:        PARAMS,
            models:        'knmi_seamless',
            forecast_days: 3,
            timezone:      'Europe/Amsterdam'
        }});
    }
}
