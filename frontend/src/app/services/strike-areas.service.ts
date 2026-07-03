import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';
import { Area, AreaPoint, AreaCrudService } from 'src/app/services/area.types';

@Injectable({ providedIn: 'root' })
export class StrikeAreasService implements AreaCrudService {

    private baseUrl = `${environment.apiUrl}/strike-areas`;
    private get headers() { return { 'x-access-token': this.authService.jwtToken }; }

    constructor(private http: HttpClient, private authService: AuthService) {}

    getAreas(): Observable<Area[]> {
        return this.http.get<Area[]>(this.baseUrl, { headers: this.headers });
    }

    createArea(area: Area): Observable<any> {
        return this.http.post(this.baseUrl, area, { headers: this.headers });
    }

    updateArea(id: number, area: Partial<Area>): Observable<any> {
        return this.http.put(`${this.baseUrl}/${id}`, area, { headers: this.headers });
    }

    updateAreaPoints(id: number, points: AreaPoint[]): Observable<any> {
        return this.http.put(`${this.baseUrl}/${id}/points`, { points }, { headers: this.headers });
    }

    deleteArea(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/${id}`, { headers: this.headers });
    }
}
