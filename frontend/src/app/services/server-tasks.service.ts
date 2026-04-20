import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ServerTasksService {

    constructor(private http: HttpClient, private auth: AuthService) {}

    getTasks(): Observable<any[]> {
        const headers = new HttpHeaders({ 'x-access-token': this.auth.jwtToken ?? '' });
        return this.http.get<any[]>(`${environment.apiUrl}/server-tasks`, { headers });
    }
}
