import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { WeatherMapModel, WeatherMapField } from 'src/app/api/weather-maps';

@Injectable({
    providedIn: 'root',
})
export class WeatherMapsService {
    private apiUrl = environment.apiUrl + '/weather-maps';

    constructor(private http: HttpClient) {}

    // The current run of every model and grid
    getModels(): Observable<WeatherMapModel[]> {
        return this.http.get<WeatherMapModel[]>(`${this.apiUrl}/models`);
    }

    // One grid; the run is part of the URL so the response never changes (the backend lets the browser cache it)
    getField(model: string, grid: string, run: string, step: number, param: string): Observable<WeatherMapField> {
        const params = new HttpParams().set('model', model).set('grid', grid).set('run', run).set('step', step).set('param', param);
        return this.http.get<WeatherMapField>(`${this.apiUrl}/field`, { params });
    }
}
