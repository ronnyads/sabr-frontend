import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;

  // Only attach auth to our API calls (relative paths).
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  if (!token) {
    console.warn('[AuthInterceptor] No token available for URL:', req.url, '- Current user:', auth.currentUser?.email || 'none');
    console.log('[AuthInterceptor] Debug info:', {
      hasToken: auth.hasToken(),
      currentUser: auth.currentUser?.email,
      isTokenFresh: auth.isTokenFresh(),
      accountType: auth.currentAccountType
    });
    return next(req);
  }

  console.log('[AuthInterceptor] Attaching token to URL:', req.url, '- User:', auth.currentUser?.email);
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};
