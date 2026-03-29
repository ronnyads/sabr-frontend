import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, map, of, tap, timeout } from 'rxjs';
import { AUTH_REALM, AuthRealm } from '../tokens/auth-realm';
import { AuthDebugLogService } from './auth-debug-log.service';

import { environment } from '../../../environments/environment';

export const BACKEND_OFFLINE_HINT_KEY = 'sabr_backend_offline_hint';
export const LOCAL_API_TARGET = environment.apiBaseUrl;
export const BACKEND_OFFLINE_MESSAGE =
  `API indisponível em ${LOCAL_API_TARGET}. O backend na nuvem pode estar suspenso (inative). Tente novamente.`;

@Injectable({ providedIn: 'root' })
export class CsrfService {
  constructor(
    private http: HttpClient,
    private authDebugLog: AuthDebugLogService,
    @Inject(AUTH_REALM) private realm: AuthRealm
  ) {}

  init(): Promise<void> {
    const baseUrl = environment.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
    const url =
      this.realm === 'admin' ? `${baseUrl}/api/v1/admin/auth/csrf` : `${baseUrl}/api/v1/auth/csrf`;
    const CSRF_TIMEOUT_MS = 2000;

    return firstValueFrom(
      this.http.get(url, { withCredentials: true }).pipe(
        timeout(CSRF_TIMEOUT_MS),
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

    if (isBackendUnavailable) {
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
      return;
    }

    // Log other CSRF errors (e.g. 400) for debugging — still allow login to proceed.
    this.authDebugLog.logLoginError({
      realm: this.realm === 'admin' ? 'admin' : 'client',
      route: 'csrf_init',
      status,
      url,
      reason: 'csrf_setup_non_fatal',
      message: `CSRF endpoint returned ${status}. Login may still work if server does not strictly require CSRF token.`
    });
  }
}
