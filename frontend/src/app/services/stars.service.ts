import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface Star {
    StarID: number;
    ProperName: string | null;
    BayerFlamsteed: string | null;
    RA: number;
    Decl: number;
    Mag: number;
    Spectrum: string | null;
    ColorIndex: number | null;
}

@Injectable({ providedIn: 'root' })
export class StarsService {
    private apiUrl = environment.apiUrl;

    constructor(private http: HttpClient) {}

    getStars(maxMag = 6.5, raMin?: number, raMax?: number, declMin?: number, declMax?: number): Observable<Star[]> {
        const params: any = { maxMag };
        if (raMin   !== undefined) params.raMin   = raMin;
        if (raMax   !== undefined) params.raMax   = raMax;
        if (declMin !== undefined) params.declMin = declMin;
        if (declMax !== undefined) params.declMax = declMax;
        return this.http.get<Star[]>(this.apiUrl + '/stars', { params });
    }
}
