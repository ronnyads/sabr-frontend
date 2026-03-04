import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const adminTenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.production) {
    return next(req);
  }

  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host.startsWith('127.');
  if (!isLocal) {
    return next(req);
  }

  // Admin endpoints already resolve platform context in local dev.
  // Non-admin endpoints (e.g. /api/v1/client-documents/*) need explicit platform context.
  if (req.url.startsWith('/api/v1/admin/')) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        'X-Tenant': 'admin'
      }
    })
  );
};

