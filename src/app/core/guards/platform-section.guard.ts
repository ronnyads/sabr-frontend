import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { normalizeRole } from '../utils/role-labels';

export const platformSectionGuard: CanActivateChildFn = (_route, state) => {
  const role = normalizeRole(inject(AuthService).currentUser?.role);
  if (role !== 8 || state.url === '/sentinel' || state.url.startsWith('/sentinel?')) return true;
  return inject(Router).createUrlTree(['/sentinel']);
};
