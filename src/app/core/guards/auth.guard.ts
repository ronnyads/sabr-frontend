import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AuthDebugLogService } from '../services/auth-debug-log.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authDebugLog = inject(AuthDebugLogService);

  if (!auth.hasToken()) {
    authDebugLog.logGuardRedirect({
      realm: 'unknown',
      guard: 'authGuard',
      from: state.url,
      to: '/login',
      decision: 'redirect',
      reason: 'no_token_skip_refresh'
    });

    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  return auth.refresh().pipe(
    map(() => true),
    catchError((error) => {
      authDebugLog.logGuardRedirect({
        realm: 'unknown',
        guard: 'authGuard',
        from: state.url,
        to: '/login',
        decision: 'redirect',
        reason: 'refresh_failed_no_valid_session'
      });

      authDebugLog.logLoginError({
        realm: 'unknown',
        route: state.url,
        status: typeof (error as any)?.status === 'number' ? (error as any).status : undefined,
        url: typeof (error as any)?.url === 'string' ? (error as any).url : undefined,
        traceId:
          (typeof (error as any)?.error?.traceId === 'string'
            ? (error as any).error.traceId
            : null) ??
          (typeof (error as any)?.headers?.get?.('X-Correlation-Id') === 'string'
            ? (error as any).headers.get('X-Correlation-Id')
            : null),
        reason: 'auth_guard_refresh_error'
      });

      return of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }));
    })
  );
};
