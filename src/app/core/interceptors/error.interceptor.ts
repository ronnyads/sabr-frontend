import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NbToastrService } from '@nebular/theme';
import { AuthDebugLogService } from '../services/auth-debug-log.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastr = inject(NbToastrService);
  const authDebugLog = inject(AuthDebugLogService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const normalizedUrl = req.url.toLowerCase();

      const isAuthLogin = normalizedUrl.includes('/auth/login');
      const isAuthRefresh = normalizedUrl.includes('/auth/refresh');
      const isAuthCsrf = normalizedUrl.includes('/auth/csrf');
      const isAuthEndpoint = isAuthLogin || isAuthRefresh || isAuthCsrf;

      if (isAuthEndpoint) {
        const endpoint = isAuthLogin ? 'login' : isAuthRefresh ? 'refresh' : 'csrf';
        authDebugLog.logLoginError({
          realm: normalizedUrl.includes('/api/v1/admin/') ? 'admin' : 'client',
          route: 'http_interceptor',
          status: error.status,
          url: req.url,
          requestId: req.headers.get('X-Request-Id') ?? req.headers.get('x-request-id'),
          traceId:
            (typeof (error as any)?.error?.traceId === 'string' ? (error as any).error.traceId : null) ??
            error.headers?.get('X-Correlation-Id') ??
            error.headers?.get('x-correlation-id'),
          source: typeof (error as any)?.error?.source === 'string' ? (error as any).error.source : undefined,
          reason: `interceptor_auth_http_error:${endpoint}`,
          message:
            (error.error as any)?.message ??
            (error.error as any)?.error ??
            error.message ??
            undefined
        });
      }

      // Auth errors (401, 400) em auth endpoints são tratados pelo auth.interceptor (auto-refresh + redirect).
      // Não mostrar toast redundante.
      if ((error.status === 401 || error.status === 400) && isAuthEndpoint) {
        return throwError(() => error);
      }
      if (error.status === 429 && isAuthLogin) {
        return throwError(() => error);
      }
      if ((error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) && isAuthEndpoint) {
        return throwError(() => error);
      }

      // Onboarding validation errors are rendered inline by field.
      const isClientProfile = normalizedUrl.includes('/api/v1/client/profile');
      const hasFieldErrors = Array.isArray((error as any)?.error?.errors);
      if (error.status === 400 && isClientProfile && hasFieldErrors) {
        return throwError(() => error);
      }

      const message =
        (error.error && ((error.error as any).message || (error.error as any).title || (error.error as any).error)) ||
        error.statusText ||
        'Erro ao processar a requisicao';
      const traceId =
        (typeof (error as any)?.error?.traceId === 'string' ? (error as any).error.traceId : null) ||
        error.headers?.get('X-Correlation-Id');
      const finalMessage = traceId ? `${message} (traceId: ${traceId})` : message;

      toastr.danger(finalMessage, `Erro ${error.status || ''}`.trim());
      return throwError(() => error);
    })
  );
};
