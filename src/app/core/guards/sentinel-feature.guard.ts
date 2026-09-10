import { CanMatchFn } from '@angular/router';
import { environment } from '../../../environments/environment';

export const sentinelFeatureGuard: CanMatchFn = () => environment.ui?.sentinelV1 === true;
