import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
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
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly SESSION_STORAGE_KEY = 'sabr.auth.session.v1';
  private accessToken: string | null = null;
  private user: AuthUser | null = null;
  private accountType: 'admin' | 'client' | null = null;
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

  login(email: string, password: string): Observable<AuthLoginResponse> {
    const payload = { email, password };
    return this.http
      .post<AuthLoginResponse>(`${this.apiBaseUrl}${this.authBasePath()}/login`, payload)
      .pipe(tap((response) => this.setSession(response)));
  }

  refresh(): Observable<AuthLoginResponse> {
    return this.http
      .post<AuthLoginResponse>(`${this.apiBaseUrl}${this.authBasePath()}/refresh`, {})
      .pipe(tap((response) => this.setSession(response)));
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.apiBaseUrl}${this.authBasePath()}/logout`, {})
      .pipe(tap(() => this.clearSession()));
  }

  changePassword(newPassword: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.apiBaseUrl}/api/v1/auth/change-password`,
      { newPassword }
    );
  }

  clearSession(): void {
    this.accessToken = null;
    this.user = null;
    this.accountType = null;
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
    this.syncTenantContext(normalizedUser);
    this.persistSession();
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

  private hydrateSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(AuthService.SESSION_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        accessToken?: string | null;
        user?: AuthUser | null;
        accountType?: 'admin' | 'client' | null;
      };

      if (!parsed || !parsed.accessToken || !parsed.user || !parsed.accountType) {
        this.clearPersistedSession();
        return;
      }

      this.accessToken = parsed.accessToken;
      this.user = parsed.user;
      this.accountType = parsed.accountType;
      this.syncTenantContext(parsed.user);
    } catch {
      this.clearPersistedSession();
    }
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
      accountType: this.accountType
    };
    window.sessionStorage.setItem(AuthService.SESSION_STORAGE_KEY, JSON.stringify(payload));
  }

  private clearPersistedSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(AuthService.SESSION_STORAGE_KEY);
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
