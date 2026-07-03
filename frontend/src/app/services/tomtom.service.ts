import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';

export interface TomtomEvent {
    code: number;
    description: string;
    iconCategory: number;
}

export interface TomtomIncident {
    type: 'Feature';
    properties: {
        id: string;
        iconCategory: number;
        magnitudeOfDelay: number;
        startTime: string;
        endTime: string | null;
        from: string;
        to: string;
        length: number;
        delay: number | null;
        roadNumbers: string[];
        timeValidity: string;
        events: TomtomEvent[];
    };
    geometry: {
        type: 'LineString';
        coordinates: [number, number][];
    };
}

export interface TomtomIncidentsResponse {
    incidents: TomtomIncident[];
}

@Injectable({ providedIn: 'root' })
export class TomtomService {

    private baseUrl = `${environment.apiUrl}/tomtom`;
    private get headers() { return { 'x-access-token': this.authService.jwtToken }; }

    constructor(private http: HttpClient, private authService: AuthService) {}

    getIncidents(minLat: number, maxLat: number, minLng: number, maxLng: number): Observable<TomtomIncidentsResponse> {
        return this.http.get<TomtomIncidentsResponse>(`${this.baseUrl}/incidents`, {
            headers: this.headers,
            params: { minLat: String(minLat), maxLat: String(maxLat), minLng: String(minLng), maxLng: String(maxLng) }
        });
    }
}
