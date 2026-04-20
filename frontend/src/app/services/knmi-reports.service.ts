import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';

const BASE = `${environment.apiUrl}/knmi-reports`;

@Injectable({ providedIn: 'root' })
export class KnmiReportsService {

    constructor(private http: HttpClient, private auth: AuthService) {}

    private get authHeaders() {
        return { 'x-access-token': this.auth.jwtToken };
    }

    getCategories(): Observable<any[]> {
        return this.http.get<any[]>(`${BASE}/categories`);
    }

    createCategory(body: any): Observable<any> {
        return this.http.post<any>(`${BASE}/categories`, body, { headers: this.authHeaders });
    }

    updateCategory(id: number, body: any): Observable<any> {
        return this.http.put<any>(`${BASE}/categories/${id}`, body, { headers: this.authHeaders });
    }

    getDatasets(): Observable<any[]> {
        return this.http.get<any[]>(`${BASE}/datasets`);
    }

    getStations(): Observable<any[]> {
        return this.http.get<any[]>(`${BASE}/stations`);
    }

    getNeerslagStations(): Observable<any[]> {
        return this.http.get<any[]>(`${BASE}/neerslagstations`);
    }

    getColumnMapping(): Observable<any[]> {
        return this.http.get<any[]>(`${BASE}/column-mapping`);
    }

    execute(body: any): Observable<any> {
        return this.http.post<any>(`${BASE}/execute`, body);
    }

    getReport(id: number): Observable<any> {
        return this.http.get<any>(`${BASE}/reports/${id}`);
    }

    exportDataset(id: number): Observable<any> {
        return this.http.get<any>(`${BASE}/datasets/${id}/export`);
    }

    createDataset(body: any): Observable<any> {
        return this.http.post<any>(`${BASE}/datasets`, body, { headers: this.authHeaders });
    }

    createReport(body: any): Observable<any> {
        return this.http.post<any>(`${BASE}/reports`, body, { headers: this.authHeaders });
    }

    updateDataset(id: number, body: any): Observable<any> {
        return this.http.put<any>(`${BASE}/datasets/${id}`, body, { headers: this.authHeaders });
    }

    updateReport(id: number, body: any): Observable<any> {
        return this.http.put<any>(`${BASE}/reports/${id}`, body, { headers: this.authHeaders });
    }

    getReportColumns(id: number): Observable<{ columns: string[] }> {
        return this.http.get<{ columns: string[] }>(`${BASE}/reports/${id}/columns`);
    }
}
