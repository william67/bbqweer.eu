import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface PriceRow {
    priceDate: string;
    priceHour: number;
    priceKwh:  number;
    source:    string;
}

@Injectable({ providedIn: 'root' })
export class EnergyPricesService {
    constructor(private http: HttpClient) {}

    getPrices(date?: string): Observable<PriceRow[]> {
        const options = date ? { params: { date } } : {};
        return this.http.get<PriceRow[]>(`${environment.apiUrl}/energie/prices`, options);
    }
}
