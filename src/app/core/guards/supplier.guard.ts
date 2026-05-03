import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { AuthDebugLogService } from '../services/auth-debug-log.service';

export const supplierGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authDebugLog = inject(AuthDebugLogService);

  const accountType = auth.currentAccountType;

  if (accountType === 'supplier') {
    authDebugLog.logGuardDecision({
      realm: 'supplier',
      guard: 'supplierGuard',
      from: state.url,
      decision: 'allow',
      reason: 'supplier_context_confirmed',
      accountTypeRaw: accountType,
      inferredType: accountType
    });
    return true;
  }

  authDebugLog.logGuardRedirect({
    realm: 'supplier',
    guard: 'supplierGuard',
    from: state.url,
    to: '/login',
    decision: 'redirect',
    reason: 'missing_supplier_context',
    accountTypeRaw: accountType,
    inferredType: accountType
  });

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
