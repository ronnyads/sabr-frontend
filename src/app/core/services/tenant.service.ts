import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly reserved = ['admin', 'www', 'api'];
  private readonly devStorageKey = 'sabr.dev.tenant.slug';
  private readonly hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  private cachedSlug: string | null | undefined;

  get isPlatform(): boolean {
    return this.hostname.toLowerCase().startsWith('admin.');
  }

  // Slug derivado do host em producao. Em dev (localhost/127), usa fallback local.
  get slug(): string | null {
    if (this.cachedSlug !== undefined) return this.cachedSlug;

    const host = this.hostname.toLowerCase();

    // Dev/local: permite fallback configurado.
    if (this.isLocalhost(host)) {
      const queryTenant = this.readTenantFromQuery();
      const persistedTenant = this.readPersistedDevTenant();
      const devTenant = environment.devTenant?.trim();
      const resolvedTenant = queryTenant || persistedTenant || devTenant;
      this.persistDevTenant(resolvedTenant ?? null);
      this.cachedSlug = resolvedTenant ?? null;
      return this.cachedSlug;
    }

    const label = host.split('.')[0];
    if (!label || this.reserved.includes(label)) {
      this.cachedSlug = null;
      return this.cachedSlug;
    }

    this.cachedSlug = label;
    return this.cachedSlug;
  }

  // Apenas em dev: permite sobrepor dinamicamente o tenant para chamadas API.
  setDevSlug(slug: string | null): void {
    if (!this.isLocalhost(this.hostname)) return;
    const normalized = slug?.trim().toLowerCase() ?? null;
    this.cachedSlug = normalized;
    this.persistDevTenant(normalized);
  }

  clearDevSlug(): void {
    this.setDevSlug(null);
  }

  private isLocalhost(host: string): boolean {
    return host === 'localhost' || host.startsWith('127.');
  }

  private readTenantFromQuery(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const value = new URLSearchParams(window.location.search).get('tenant');
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private readPersistedDevTenant(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const value = window.sessionStorage.getItem(this.devStorageKey)?.trim().toLowerCase();
    return value || null;
  }

  private persistDevTenant(value: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (!value) {
      window.sessionStorage.removeItem(this.devStorageKey);
      return;
    }

    window.sessionStorage.setItem(this.devStorageKey, value);
  }
}
