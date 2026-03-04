import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { normalizeRole } from '../utils/role-labels';
import { AuthDebugLogService } from '../services/auth-debug-log.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authDebugLog = inject(AuthDebugLogService);

  const accountTypeRaw = auth.currentAccountType ?? auth.currentUser?.accountType ?? null;
  const accountType = typeof accountTypeRaw === 'string' ? accountTypeRaw.trim().toLowerCase() : null;
  const role = normalizeRole(auth.currentUser?.role);
  const inferredType = accountType === 'admin' || role > 0 ? 'admin' : accountType;

  if (inferredType === 'admin') {
    authDebugLog.logGuardDecision({
      realm: 'admin',
      guard: 'adminGuard',
      from: state.url,
      decision: 'allow',
      reason: 'admin_context_confirmed',
      accountTypeRaw,
      roleNormalized: role,
      inferredType
    });
    return true;
  }

  if (inferredType === 'client') {
    authDebugLog.logGuardRedirect({
      realm: 'admin',
      guard: 'adminGuard',
      from: state.url,
      to: '/login',
      decision: 'redirect',
      reason: 'client_context_on_admin_route',
      accountTypeRaw,
      roleNormalized: role,
      inferredType
    });
    return router.createUrlTree(['/login']);
  }

  authDebugLog.logGuardRedirect({
    realm: 'admin',
    guard: 'adminGuard',
    from: state.url,
    to: '/login',
    decision: 'redirect',
    reason: 'missing_admin_context',
    accountTypeRaw,
    roleNormalized: role,
    inferredType
  });

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
