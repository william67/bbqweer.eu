import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = 'https://api.open-meteo.com/v1/forecast';

const PARAMS = [
    'temperature_2m', 'precipitation', 'windspeed_10m', 'winddirection_10m', 'wind_gusts_10m',
    'weathercode', 'cloud_cover', 'relativehumidity_2m', 'pressure_msl', 'snowfall',
    'global_tilted_irradiance', 'temperature_850hPa', 'temperature_500hPa'
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
            forecast_days: 11,
            past_days:     1,   // UTC day starts at 02:00 local; the extra day gives today's first hours, the component trims to 10 local days
            tilt:          0,
            azimuth:       0,
            timezone:      'UTC'
        }});
    }
}
