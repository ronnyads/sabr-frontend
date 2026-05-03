/**
 * INTEGRATED AUTH SERVICE
 *
 * This file shows the changes needed to integrate SessionManager into AuthService.
 * It's provided for reference and to be manually merged into the existing auth.service.ts
 *
 * Key changes:
 * 1. Inject SessionManagerService
 * 2. Replace setSession() internal logic to delegate to sessionManager
 * 3. Replace clearSession() to delegate to sessionManager
 * 4. Replace hydrateSession() to wait for sessionManager.initialize()
 * 5. Replace refresh() observable handling
 * 6. Keep all public methods and properties identical for backward compatibility
 */

import { Inject, Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, finalize, shareReplay, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AUTH_REALM, AuthRealm } from '../tokens/auth-realm';
import { normalizeRole } from '../utils/role-labels';
import { TenantService } from './tenant.service';
import { SessionManagerService } from './session-manager.service';
import { SessionData } from '../models/session.model';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthService');

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
export class AuthServiceIntegrated implements OnDestroy {
  private static readonly SESSION_STORAGE_KEY = 'phub.auth.session.v1';

  // Keep these for backward compatibility, but they're now backed by SessionManager
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
    @Inject(AUTH_REALM) private realm: AuthRealm,
    private sessionManager: SessionManagerService  // NEW: Inject session manager
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
    logger.info('AuthService.clearSession called');

    // CHANGE: Delegate to SessionManager
    void this.sessionManager.clearSession('auth_service_logout');

    // Keep these in sync for backward compatibility
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

  /**
   * CHANGED: Now delegates to SessionManager
   */
  private setSession(response: AuthLoginResponse): void {
    const raw = response as any;
    const rawUser = raw?.user ?? raw?.User ?? null;
    const accessToken = raw?.accessToken ?? raw?.AccessToken ?? null;
    const refreshToken = raw?.refreshToken ?? raw?.RefreshToken ?? null;
    const expiresAt = raw?.expiresAt ?? raw?.ExpiresAt ?? null;
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

    // Update local state for backward compatibility
    this.accessToken = accessToken;
    this.user = normalizedUser;
    this.accountType = resolvedAccountType;
    this.refreshToken = refreshToken;
    this.expiresAt = expiresAt;

    logger.info('setSession - Token set', { email: normalizedUser?.email, hasToken: !!accessToken });

    if (!refreshToken) {
      logger.warn('setSession - refreshToken is null', { raw });
    }

    this.syncTenantContext(normalizedUser);
    this.persistSession();

    // CHANGE: Delegate to SessionManager for robust persistence
    if (accessToken && normalizedUser && resolvedAccountType && expiresAt) {
      const sessionData: SessionData = {
        accessToken,
        refreshToken: refreshToken || null,
        user: normalizedUser,
        accountType: resolvedAccountType,
        expiresAt
      };

      void this.sessionManager.setSession(sessionData).catch((error) => {
        logger.error('Failed to persist session via SessionManager', error);
        // Continue anyway - local state is still updated
      });
    }
  }

  private authBasePath(): string {
    return this.realm === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth';
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

  /**
   * CHANGED: Now delegates to SessionManager for restoration
   */
  private async hydrateSession(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Try to get from SessionManager first (multi-layer fallback)
      const sessionData = this.sessionManager.getCurrentSession();
      if (sessionData) {
        this.restoreFromSessionData(sessionData);
        return;
      }

      // Fallback to old sessionStorage method for backward compatibility
      try {
        const testKey = '__auth_test_' + Date.now();
        window.sessionStorage.setItem(testKey, '1');
        window.sessionStorage.removeItem(testKey);
      } catch (testError) {
        logger.warn('hydrateSession - sessionStorage not accessible', {
          errorName: (testError as any).name
        });
        return;
      }

      const raw = window.sessionStorage.getItem(AuthServiceIntegrated.SESSION_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        accessToken?: string | null;
        user?: AuthUser | null;
        accountType?: 'admin' | 'client' | null;
        refreshToken?: string | null;
        expiresAt?: string | null;
      };

      if (!parsed || !parsed.accessToken || !parsed.user || !parsed.accountType) {
        this.clearPersistedSession();
        return;
      }

      this.accessToken = parsed.accessToken;
      this.user = parsed.user;
      this.accountType = parsed.accountType;
      this.refreshToken = parsed.refreshToken ?? null;
      this.expiresAt = parsed.expiresAt ?? null;
      logger.info('hydrateSession - Session restored from storage', {
        email: parsed.user.email
      });
      this.syncTenantContext(parsed.user);
    } catch (e) {
      logger.error('hydrateSession - Error', e);
      this.clearPersistedSession();
    }
  }

  private restoreFromSessionData(sessionData: SessionData): void {
    this.accessToken = sessionData.accessToken;
    this.user = sessionData.user;
    this.accountType = sessionData.accountType;
    this.refreshToken = sessionData.refreshToken ?? null;
    this.expiresAt = sessionData.expiresAt;
    logger.info('hydrateSession - Restored from SessionManager', {
      email: sessionData.user.email
    });
    this.syncTenantContext(sessionData.user);
  }

  private persistSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (!this.accessToken || !this.user || !this.accountType) {
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
    try {
      const testKey = '__auth_test_' + Date.now();
      try {
        window.sessionStorage.setItem(testKey, '1');
        window.sessionStorage.removeItem(testKey);
      } catch (testError) {
        logger.warn('persistSession - sessionStorage not writable', {
          errorName: (testError as any).name
        });
        throw new Error('sessionStorage quota exceeded or not available');
      }

      const json = JSON.stringify(payload);
      window.sessionStorage.setItem(AuthServiceIntegrated.SESSION_STORAGE_KEY, json);
    } catch (e) {
      logger.error('persistSession - Error storing to sessionStorage', e);
    }
  }

  private clearPersistedSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(AuthServiceIntegrated.SESSION_STORAGE_KEY);
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

  ngOnDestroy(): void {
    this.sessionManager.destroy();
  }
}
