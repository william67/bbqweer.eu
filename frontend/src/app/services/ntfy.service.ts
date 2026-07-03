import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/services/auth.service';

@Injectable({ providedIn: 'root' })
export class NtfyService {

    private baseUrl = `${environment.apiUrl}/ntfy`;
    private get headers() { return { 'x-access-token': this.authService.jwtToken }; }

    constructor(private http: HttpClient, private authService: AuthService) {}

    sendTest(type: 'traffic' | 'lightning'): Observable<{ queued: boolean }> {
        return this.http.post<{ queued: boolean }>(`${this.baseUrl}/test`, { type }, { headers: this.headers });
    }
}
