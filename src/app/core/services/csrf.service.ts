import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { AUTH_REALM, AuthRealm } from '../tokens/auth-realm';
import { AuthDebugLogService } from './auth-debug-log.service';

export const BACKEND_OFFLINE_HINT_KEY = 'sabr_backend_offline_hint';
export const LOCAL_API_TARGET = 'http://127.0.0.1:5250';
export const BACKEND_OFFLINE_MESSAGE =
  `API local indisponivel em ${LOCAL_API_TARGET}. Inicie o backend e tente novamente.`;

@Injectable({ providedIn: 'root' })
export class CsrfService {
  constructor(
    private http: HttpClient,
    private authDebugLog: AuthDebugLogService,
    @Inject(AUTH_REALM) private realm: AuthRealm
  ) {}

  init(): Promise<void> {
    const url =
      this.realm === 'admin' ? '/api/v1/admin/auth/csrf' : '/api/v1/auth/csrf';

    return firstValueFrom(
      this.http.get(url).pipe(
        tap(() => {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(BACKEND_OFFLINE_HINT_KEY);
          }
        }),
        catchError((error: HttpErrorResponse) => {
          this.handleCsrfFailure(url, error);
          return of(null);
        }),
        map(() => void 0)
      )
    );
  }

  private handleCsrfFailure(url: string, error: HttpErrorResponse): void {
    const status = typeof error?.status === 'number' ? error.status : 0;
    const isBackendUnavailable = status === 0 || status === 502 || status === 503 || status === 504;
    if (!isBackendUnavailable) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(BACKEND_OFFLINE_HINT_KEY, BACKEND_OFFLINE_MESSAGE);
    }

    this.authDebugLog.logLoginError({
      realm: this.realm === 'admin' ? 'admin' : 'client',
      route: 'csrf_init',
      status,
      url,
      reason: 'backend_offline',
      message: BACKEND_OFFLINE_MESSAGE
    });
  }
}
