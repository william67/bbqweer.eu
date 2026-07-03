import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';
import { TomtomIncident } from 'src/app/services/tomtom.service';

export interface AreaPoint { lat: number; lng: number; }

export interface FileArea {
    id?: number;
    name: string;
    description?: string | null;
    color: string;
    active?: number;
    points: AreaPoint[];
    incidentCount?: number;
}

@Injectable({ providedIn: 'root' })
export class FileAreasService {

    private baseUrl = `${environment.apiUrl}/file-areas`;
    private get headers() { return { 'x-access-token': this.authService.jwtToken }; }

    constructor(private http: HttpClient, private authService: AuthService) {}

    getAreas(): Observable<FileArea[]> {
        return this.http.get<FileArea[]>(this.baseUrl, { headers: this.headers });
    }

    getAreaIncidents(id: number): Observable<TomtomIncident[]> {
        return this.http.get<TomtomIncident[]>(`${this.baseUrl}/${id}/incidents`, { headers: this.headers });
    }

    createArea(area: FileArea): Observable<any> {
        return this.http.post(this.baseUrl, area, { headers: this.headers });
    }

    updateArea(id: number, area: Partial<FileArea>): Observable<any> {
        return this.http.put(`${this.baseUrl}/${id}`, area, { headers: this.headers });
    }

    updateAreaPoints(id: number, points: AreaPoint[]): Observable<any> {
        return this.http.put(`${this.baseUrl}/${id}/points`, { points }, { headers: this.headers });
    }

    deleteArea(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/${id}`, { headers: this.headers });
    }
}
