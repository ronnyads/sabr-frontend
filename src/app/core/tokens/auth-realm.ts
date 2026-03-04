import { InjectionToken } from '@angular/core';

export type AuthRealm = 'client' | 'admin';

export const AUTH_REALM = new InjectionToken<AuthRealm>('AUTH_REALM');

