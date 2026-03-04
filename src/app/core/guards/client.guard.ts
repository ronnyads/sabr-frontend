import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { AuthDebugLogService } from '../services/auth-debug-log.service';

export const clientGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authDebugLog = inject(AuthDebugLogService);

  const inferredType = auth.currentAccountType ?? (auth.currentUser?.role ? 'admin' : null);

  if (inferredType === 'client') {
    authDebugLog.logGuardDecision({
      realm: 'client',
      guard: 'clientGuard',
      from: state.url,
      decision: 'allow',
      reason: 'client_context_confirmed',
      accountTypeRaw: auth.currentAccountType,
      inferredType
    });
    return true;
  }

  if (inferredType === 'admin') {
    authDebugLog.logGuardRedirect({
      realm: 'client',
      guard: 'clientGuard',
      from: state.url,
      to: '/login',
      decision: 'redirect',
      reason: 'admin_context_on_client_route',
      accountTypeRaw: auth.currentAccountType,
      inferredType
    });
    return router.createUrlTree(['/login']);
  }

  authDebugLog.logGuardRedirect({
    realm: 'client',
    guard: 'clientGuard',
    from: state.url,
    to: '/login',
    decision: 'redirect',
    reason: 'missing_client_context',
    accountTypeRaw: auth.currentAccountType,
    inferredType
  });

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
