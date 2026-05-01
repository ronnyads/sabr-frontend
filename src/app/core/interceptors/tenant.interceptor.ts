import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TenantService } from '../services/tenant.service';

export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  const normalizedUrl = req.url.toLowerCase();
  if (normalizedUrl.includes('/api/v1/auth/login')) {
    return next(req);
  }

  const tenantService = inject(TenantService);
  const slug = tenantService.slug;

  // In production, always send X-Tenant header when available (needed when using api.* domain).
  // In dev/localhost, send X-Tenant header as a simulation of subdomain-based tenant resolution.
  if (!slug) {
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
