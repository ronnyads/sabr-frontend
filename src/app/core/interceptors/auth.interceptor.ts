import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError, of } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Endpoints públicos — nunca devem receber token no header
const PUBLIC_AUTH_ENDPOINTS = ['/auth/csrf', '/auth/login', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Only attach auth to our API calls (relative or absolute paths).
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  // Skip token para endpoints públicos de autenticação
  if (PUBLIC_AUTH_ENDPOINTS.some(ep => req.url.includes(ep))) {
    console.log('[AuthInterceptor] Skipping token for public auth endpoint:', req.url);
    return next(req);
  }

  const token = auth.token;
  if (!token) {
    console.warn('[AuthInterceptor] No token available for URL:', req.url, '- Current user:', auth.currentUser?.email || 'none');
    return next(req);
  }

  // Se token está fresco, envia normalmente
  if (auth.isTokenFresh()) {
    console.log('[AuthInterceptor] Token é fresco, anexando para URL:', req.url);
    return next(attachToken(req, token)).pipe(
      catchError(err => {
        if (err.status === 401) {
          console.warn('[AuthInterceptor] Recebido 401, tentando refresh...');
          return handle401(req, next, auth, router);
        }
        return throwError(() => err);
      })
    );
  }

  // Token não está fresco — tenta refresh antes de enviar a request
  console.log('[AuthInterceptor] Token expirado ou expirando, fazendo refresh preventivo...');
  return auth.refresh().pipe(
    switchMap(resp => {
      const newToken = resp.accessToken || auth.token;
      if (!newToken) {
        throw new Error('Refresh returned no token');
      }
      console.log('[AuthInterceptor] Refresh bem-sucedido, reenviando request com novo token');
      return next(attachToken(req, newToken));
    }),
    catchError((err: any) => {
      console.error('[AuthInterceptor] Refresh falhou, fazendo logout silencioso');
      auth.clearSession();
      void router.navigate(['/login'], { queryParams: { reason: 'session_expired' } });
      return throwError(() => err);
    })
  ) as any;
};

/** Anexa o token Bearer ao header Authorization */
function attachToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

/** Trata 401 tentando refresh + retry da request */
function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  router: Router
) {
  return auth.refresh().pipe(
    switchMap(resp => {
      const newToken = resp.accessToken || auth.token;
      if (!newToken) {
        throw new Error('Refresh returned no token');
      }
      console.log('[AuthInterceptor] Refresh após 401 bem-sucedido, retentando request');
      return next(attachToken(req, newToken));
    }),
    catchError((err: any) => {
      console.error('[AuthInterceptor] Refresh após 401 falhou, fazendo logout');
      auth.clearSession();
      void router.navigate(['/login'], { queryParams: { reason: 'session_expired' } });
      return throwError(() => err);
    })
  ) as any;
}
