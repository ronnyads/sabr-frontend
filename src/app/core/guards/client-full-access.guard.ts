import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ClientStatus } from '../utils/client-status.constants';

/**
 * Blocks routes that require full (Approved) access.
 * Users with status UnderReview / PendingDocuments / Rejected are redirected
 * to the dashboard with a hint so the shell can show an "access restricted" message.
 */
export const clientFullAccessGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  const status = user.status ?? ClientStatus.PendingProfile;

  // Full access only for Approved users
  if (status === ClientStatus.Approved) {
    return true;
  }

  // Redirect to dashboard with hint about the blocked route
  return router.createUrlTree(['/client/dashboard'], {
    queryParams: { blocked: state.url }
  });
};
