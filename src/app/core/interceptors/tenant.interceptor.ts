import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TenantService } from '../services/tenant.service';

export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.production) {
    return next(req);
  }

  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const normalizedUrl = req.url.toLowerCase();
  if (
    normalizedUrl.includes('/api/v1/auth/login') ||
    normalizedUrl.includes('/api/v1/auth/csrf')
  ) {
    return next(req);
  }

  const tenantService = inject(TenantService);
  const slug = tenantService.slug;

  // Somente em dev/localhost aplicamos header X-Tenant (simulacao de subdominio).
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host.startsWith('127.');

  if (!isLocal || !slug) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: {
        'X-Tenant': slug
      }
    })
  );
};
