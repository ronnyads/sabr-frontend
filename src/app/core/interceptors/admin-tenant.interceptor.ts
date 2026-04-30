import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const adminTenantInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  // Sempre envia o contexto de plataforma para admin realm; backend ignora para /api/v1/admin/*
  // mas usa como fallback em hosts api.marketplaceonline.site.
  return next(
    req.clone({
      setHeaders: {
        'X-Tenant': 'admin'
      }
    })
  );
};
