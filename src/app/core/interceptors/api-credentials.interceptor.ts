import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AUTH_REALM } from '../tokens/auth-realm';

const API_BASE = environment.apiBaseUrl.replace(/\/+$/, '');

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const cookies = document.cookie?.split(';') ?? [];
  for (const raw of cookies) {
    const [key, ...rest] = raw.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
};

/**
 * Garante credenciais + header XSRF em todas as chamadas para o API_BASE (domínio api.marketplaceonline.site).
 */
export const apiCredentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) {
    return next(req);
  }

  const realm = inject(AUTH_REALM);
  const cookieName = realm === 'admin' ? 'XSRF-ADMIN' : 'XSRF-TOKEN';
  const headerName = realm === 'admin' ? 'X-XSRF-ADMIN' : 'X-XSRF-TOKEN';
  const token = readCookie(cookieName);

  return next(
    req.clone({
      withCredentials: true,
      setHeaders: token ? { [headerName]: token } : undefined
    })
  );
};
