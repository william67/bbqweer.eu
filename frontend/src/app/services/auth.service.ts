import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';
import { environment } from 'src/environments/environment';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  userId!: number;
  firstName: string = 'Not logged in';
  lastName: string = '';
  email!: string;
  userRoles: string[] = [];
  jwtToken: string = '';
  decodedJwtToken: any;
  iat?: Date;
  exp?: Date;

  private _authChanged$ = new Subject<void>();
  authChanged$ = this._authChanged$.asObservable();

  private _isLoggedIn = false;
  get isLoggedIn(): boolean { return this._isLoggedIn; }
  set isLoggedIn(value: boolean) {
    this._isLoggedIn = value;
    this._authChanged$.next();
  }

  constructor(private http: HttpClient, private localStorageService: LocalStorageService) {
    const stored = this.localStorageService.getData('jwtToken');
    if (stored) { this.jwtToken = stored; }
  }

  hasRole(role: string): boolean {
    return this.userRoles.includes(role);
  }

  logout() {
    this.userId = 0;
    this.firstName = 'Not logged in';
    this.lastName = '';
    this.userRoles = [];
    this.jwtToken = '';
    this.localStorageService.removeData('jwtToken');
    this.decodedJwtToken = undefined;
    this.iat = undefined;
    this.exp = undefined;
    this.isLoggedIn = false;
  }

  userLogin(body: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, body).pipe(
      tap((response: any) => {
        this.userId = response.userId;
        this.firstName = response.firstName;
        this.lastName = response.lastName ?? '';
        this.userRoles = response.userRoles ?? ['admin'];
        this.jwtToken = response.token;
        this.localStorageService.saveData('jwtToken', response.token);
        this.decodedJwtToken = jwtDecode(response.token);
        this.iat = new Date(this.decodedJwtToken.iat * 1000);
        this.exp = new Date(this.decodedJwtToken.exp * 1000);
        this.isLoggedIn = true;
      }),
      catchError((error: HttpErrorResponse) => {
        this.logout();
        return this.handleError(error);
      })
    );
  }

  checkToken(body: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/checktoken`, body).pipe(
      tap((response: any) => {
        this.userId = response.userId;
        this.firstName = response.firstName;
        this.lastName = response.lastName ?? '';
        this.userRoles = response.userRoles ?? ['admin'];
        this.jwtToken = body.token;
        this.decodedJwtToken = jwtDecode(body.token);
        this.iat = new Date(this.decodedJwtToken.iat * 1000);
        this.exp = new Date(this.decodedJwtToken.exp * 1000);
        this.isLoggedIn = true;
      }),
      catchError((error: HttpErrorResponse) => {
        this.logout();
        return this.handleError(error);
      })
    );
  }

  updateProfile(data: { firstName: string; lastName: string; password?: string }): Observable<any> {
    const body: any = { firstName: data.firstName, lastName: data.lastName };
    if (data.password) body.password = data.password;
    return this.http.put<any>(`${this.apiUrl}/users/${this.userId}`, body, {
      headers: { 'x-access-token': this.jwtToken }
    }).pipe(
      tap(() => {
        this.firstName = data.firstName;
        this.lastName = data.lastName;
      }),
      catchError((error: HttpErrorResponse) => this.handleError(error))
    );
  }

  handleError(error: HttpErrorResponse) {
    let errorMessage: string;
    if (error.error instanceof ErrorEvent) {
      errorMessage = 'An error occurred: ' + error.error.message;
    } else {
      errorMessage = `Backend returned code ${error.status}, body was: ${JSON.stringify(error.error, null, 2)}`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
