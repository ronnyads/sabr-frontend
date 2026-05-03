import { InjectionToken } from '@angular/core';

export type AuthRealm = 'client' | 'admin' | 'supplier';

export const AUTH_REALM = new InjectionToken<AuthRealm>('AUTH_REALM');

