import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ClientStatus } from '../utils/client-status.constants';

/**
 * Redirects to onboarding only for users who haven't even started their profile
 * (status = PendingProfile) or who need to change their password.
 *
 * Users in UnderReview / PendingDocuments / Rejected are allowed into the shell
 * with partial access — they do NOT need to revisit the onboarding wizard.
 */
export const clientOnboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  const status = user.status ?? ClientStatus.PendingProfile;

  // Force onboarding only for users with incomplete profile or mandatory password change
  const mustOnboard =
    !!user.mustChangePassword || status === ClientStatus.PendingProfile;

  if (mustOnboard) {
    return router.createUrlTree(['/client/onboarding']);
  }

  return true;
};
