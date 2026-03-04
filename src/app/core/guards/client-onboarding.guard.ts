import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const clientOnboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.currentUser;

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  const mustOnboard = !!user.mustChangePassword || user.status === 0;
  if (mustOnboard) {
    return router.createUrlTree(['/client/onboarding']);
  }

  return true;
};
