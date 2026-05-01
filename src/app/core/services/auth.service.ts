import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, finalize, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AUTH_REALM, AuthRealm } from '../tokens/auth-realm';
import { normalizeRole } from '../utils/role-labels';
import { TenantService } from './tenant.service';

export interface AuthUser {
  id: string;
  tenantId: string;
  tenantSlug?: string | null;
  name: string;
  email: string;
  accountType: 'admin' | 'client';
  role?: string | number | null;
  sectorCode?: string | null;
  isActive: boolean;
  mustChangePassword?: boolean | null;
  status?: number | null;
  onboardingStep?: number | null;
}

export interface AuthLoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  accountType: 'admin' | 'client';
  user: AuthUser;
  refreshToken?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly SESSION_STORAGE_KEY = 'sabr.auth.session.v1';
  private accessToken: string | null = null;
  private user: AuthUser | null = null;
  private accountType: 'admin' | 'client' | null = null;
  private refreshToken: string | null = null;
  private expiresAt: string | null = null;
  private refreshInProgress$: Observable<AuthLoginResponse> | null = null;
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private tenantService: TenantService,
    @Inject(AUTH_REALM) private realm: AuthRealm
  ) {
    this.hydrateSession();
  }

  get token(): string | null {
    return this.accessToken;
  }

  get currentUser(): AuthUser | null {
    return this.user;
  }

  get currentAccountType(): 'admin' | 'client' | null {
    return this.accountType;
  }

  hasToken(): boolean {
    return !!this.accessToken;
  }

  isTokenFresh(): boolean {
    if (!this.accessToken || !this.expiresAt) return false;
    const expiry = new Date(this.expiresAt).getTime();
    const bufferMs = 5 * 60 * 1000;
    return expiry - Date.now() > bufferMs;
  }

  login(email: string, password: string): Observable<AuthLoginResponse> {
    const payload = { email, password };
    return this.http
      .post<AuthLoginResponse>(`${this.apiBaseUrl}${this.authBasePath()}/login`, payload, {
        withCredentials: true
      })
      .pipe(tap((response) => this.setSession(response)));
  }

  refresh(): Observable<AuthLoginResponse> {
    if (this.refreshInProgress$) return this.refreshInProgress$;

    this.refreshInProgress$ = this.http
      .post<AuthLoginResponse>(
        `${this.apiBaseUrl}${this.authBasePath()}/refresh`,
        this.refreshToken ? { refreshToken: this.refreshToken } : {},
        { withCredentials: true }
      )
      .pipe(
        tap((response) => this.setSession(response)),
        finalize(() => {
          this.refreshInProgress$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshInProgress$;
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.apiBaseUrl}${this.authBasePath()}/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearSession()));
  }

  changePassword(newPassword: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.apiBaseUrl}/auth/change-password`,
      { newPassword }
    );
  }

  clearSession(): void {
    console.log('[AuthService] clearSession called - Clearing all auth data');
    console.trace('[AuthService] clearSession stack trace');
    this.accessToken = null;
    this.user = null;
    this.accountType = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.tenantService.clearDevSlug();
    this.clearPersistedSession();
  }

  updateCurrentUser(partial: Partial<AuthUser>): void {
    if (!this.user) {
      return;
    }
    this.user = { ...this.user, ...partial };
    this.persistSession();
  }

  redirectToLogin(returnUrl?: string): void {
    void this.router.navigate(['/login'], {
      queryParams: returnUrl ? { returnUrl } : undefined
    });
  }

  private setSession(response: AuthLoginResponse): void {
    const raw = response as any;
    const rawUser = raw?.user ?? raw?.User ?? null;
    const accessToken = raw?.accessToken ?? raw?.AccessToken ?? null;
    this.refreshToken = raw?.refreshToken ?? raw?.RefreshToken ?? null;
    this.expiresAt = raw?.expiresAt ?? raw?.ExpiresAt ?? null;
    const accountTypeRaw =
      raw?.accountType ??
      raw?.AccountType ??
      rawUser?.accountType ??
      rawUser?.AccountType ??
      null;
    const scopeRaw = rawUser?.scope ?? rawUser?.Scope ?? null;
    const roleRaw = rawUser?.role ?? rawUser?.Role ?? null;

    const normalizedAccountType = this.normalizeAccountType(accountTypeRaw);
    const normalizedScope = typeof scopeRaw === 'string' ? scopeRaw.trim().toLowerCase() : '';
    const fallbackByRole = normalizeRole(roleRaw) > 0 ? 'admin' : 'client';
    const resolvedAccountType: 'admin' | 'client' =
      normalizedAccountType ??
      (normalizedScope === 'platform' ? 'admin' : fallbackByRole);

    const normalizedUser: AuthUser | null = rawUser
      ? {
          id: rawUser.id ?? rawUser.Id,
          tenantId: rawUser.tenantId ?? rawUser.TenantId,
          tenantSlug: rawUser.tenantSlug ?? rawUser.TenantSlug ?? null,
          name: rawUser.name ?? rawUser.Name,
          email: rawUser.email ?? rawUser.Email,
          accountType: resolvedAccountType,
          role: roleRaw,
          sectorCode: rawUser.sectorCode ?? rawUser.SectorCode ?? null,
          isActive: rawUser.isActive ?? rawUser.IsActive ?? false,
          mustChangePassword: rawUser.mustChangePassword ?? rawUser.MustChangePassword ?? null,
          status: rawUser.status ?? rawUser.Status ?? null,
          onboardingStep: rawUser.onboardingStep ?? rawUser.OnboardingStep ?? null
        }
      : null;

    this.accessToken = accessToken;
    this.user = normalizedUser;
    this.accountType = resolvedAccountType;
    console.log('[AuthService] setSession - Token set:', !!accessToken, 'Email:', normalizedUser?.email);
    if (!this.refreshToken) {
      console.warn('[AuthService] refreshToken is null after setSession!', { raw });
    }
    this.syncTenantContext(normalizedUser);
    this.persistSession();
  }

  private authBasePath(): string {
    // apiBaseUrl já contém /api/v1, então retornar apenas o sufixo
    return this.realm === 'admin' ? '/admin/auth' : '/auth';
  }

  private normalizeAccountType(value: unknown): 'admin' | 'client' | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'client') {
      return normalized;
    }

    if (normalized === 'platform') {
      return 'admin';
    }

    return null;
  }

  private hydrateSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    let raw: string | null = null;
    let restoredFrom = 'none';

    // LAYER 1: Try sessionStorage first
    try {
      const testKey = '__auth_test_' + Date.now();
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      raw = window.sessionStorage.getItem(AuthService.SESSION_STORAGE_KEY);
      if (raw) {
        restoredFrom = 'sessionStorage';
        console.log('[AuthService] hydrateSession - Restored from sessionStorage');
      }
    } catch (e) {
      console.warn('[AuthService] hydrateSession - sessionStorage unavailable:', (e as Error).message);
    }

    // LAYER 2: Try localStorage if sessionStorage didn't work
    if (!raw) {
      try {
        raw = window.localStorage.getItem(AuthService.SESSION_STORAGE_KEY);
        if (raw) {
          restoredFrom = 'localStorage';
          console.log('[AuthService] hydrateSession - Restored from localStorage (fallback)');
        }
      } catch (e) {
        console.warn('[AuthService] hydrateSession - localStorage unavailable:', (e as Error).message);
      }
    }

    // LAYER 3: Try memory fallback if neither storage worked
    if (!raw) {
      const memSession = (window as any).__authSession__;
      if (memSession) {
        raw = JSON.stringify(memSession);
        restoredFrom = 'memory';
        console.log('[AuthService] hydrateSession - Restored from memory fallback (window.__authSession__)');
      }
    }

    console.log('[AuthService] hydrateSession - Found stored session:', !!raw, '- Source:', restoredFrom);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        accessToken?: string | null;
        user?: AuthUser | null;
        accountType?: 'admin' | 'client' | null;
        refreshToken?: string | null;
        expiresAt?: string | null;
      };

      if (!parsed || !parsed.accessToken || !parsed.user || !parsed.accountType) {
        console.log('[AuthService] hydrateSession - Invalid parsed data:', { token: !!parsed?.accessToken, user: !!parsed?.user, accountType: !!parsed?.accountType });
        this.clearPersistedSession();
        return;
      }

      this.accessToken = parsed.accessToken;
      this.user = parsed.user;
      this.accountType = parsed.accountType;
      this.refreshToken = parsed.refreshToken ?? null;
      this.expiresAt = parsed.expiresAt ?? null;
      console.log('[AuthService] hydrateSession - Session fully restored:', { email: parsed.user.email, accountType: parsed.accountType, restoredFrom });
      this.syncTenantContext(parsed.user);
    } catch (e) {
      console.error('[AuthService] hydrateSession - Error parsing session:', e);
      this.clearPersistedSession();
    }
  }
  private persistSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (!this.accessToken || !this.user || !this.accountType) {
      console.log('[AuthService] persistSession - Missing required fields:', { token: !!this.accessToken, user: !!this.user, accountType: !!this.accountType });
      this.clearPersistedSession();
      return;
    }

    const payload = {
      accessToken: this.accessToken,
      user: this.user,
      accountType: this.accountType,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt
    };

    const json = JSON.stringify(payload);
    let stored = false;
    let storageType = 'none';

    // LAYER 1: ALWAYS store in memory as ultimate fallback
    (window as any).__authSession__ = payload;
    console.log('[AuthService] persistSession - Stored in memory (always available)');

    // LAYER 2: Try sessionStorage
    try {
      const testKey = '__auth_test_' + Date.now();
      window.sessionStorage.setItem(testKey, '1');
      window.sessionStorage.removeItem(testKey);
      window.sessionStorage.setItem(AuthService.SESSION_STORAGE_KEY, json);
      const verify = window.sessionStorage.getItem(AuthService.SESSION_STORAGE_KEY);
      if (verify) {
        stored = true;
        storageType = 'sessionStorage';
        console.log('[AuthService] persistSession - Stored in sessionStorage:', { email: this.user.email, accountType: this.accountType, size: json.length });
      }
    } catch (e) {
      console.warn('[AuthService] persistSession - sessionStorage failed:', { errorName: (e as any).name, message: (e as Error).message });
    }

    // LAYER 3: If sessionStorage failed, try localStorage
    if (!stored) {
      try {
        window.localStorage.setItem(AuthService.SESSION_STORAGE_KEY, json);
        const verify = window.localStorage.getItem(AuthService.SESSION_STORAGE_KEY);
        if (verify) {
          stored = true;
          storageType = 'localStorage';
          console.log('[AuthService] persistSession - Stored in localStorage (fallback):', { email: this.user.email, accountType: this.accountType });
        }
      } catch (e) {
        console.warn('[AuthService] persistSession - localStorage failed:', { errorName: (e as any).name, message: (e as Error).message });
      }
    }

    if (!stored) {
      console.warn('[AuthService] persistSession - Both storage layers failed. Session persists ONLY in memory (window.__authSession__). Will be lost on page reload.');
    } else {
      console.log('[AuthService] persistSession - Successfully persisted via:', storageType);
    }
  }

  private clearPersistedSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Clear from all 3 storage layers
    try {
      window.sessionStorage.removeItem(AuthService.SESSION_STORAGE_KEY);
    } catch (e) {
      // Ignore errors
    }

    try {
      window.localStorage.removeItem(AuthService.SESSION_STORAGE_KEY);
    } catch (e) {
      // Ignore errors
    }

    try {
      delete (window as any).__authSession__;
    } catch (e) {
      // Ignore errors
    }

    console.log('[AuthService] clearPersistedSession - Cleared from all storage layers');
  }

  private syncTenantContext(user: AuthUser | null): void {
    if (this.realm !== 'client') {
      return;
    }

    const tenantSlug = user?.tenantSlug?.trim().toLowerCase() ?? '';
    if (tenantSlug) {
      this.tenantService.setDevSlug(tenantSlug);
      return;
    }

    if (!user) {
      this.tenantService.clearDevSlug();
    }
  }
}
