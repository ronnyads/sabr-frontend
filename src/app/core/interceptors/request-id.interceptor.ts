import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { RequestIdService } from '../services/request-id.service';

export const requestIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) {
    return next(req);
  }

  const idService = inject(RequestIdService);
  const requestId = idService.generate();
  return next(
    req.clone({
      setHeaders: {
        'X-Request-Id': requestId
      }
    })
  );
};
