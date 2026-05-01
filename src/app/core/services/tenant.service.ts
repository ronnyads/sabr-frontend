import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly reserved = ['admin', 'www', 'api', 'app'];
  private readonly devStorageKey = 'sabr.dev.tenant.slug';
  private readonly hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  private cachedSlug: string | null | undefined;

  get isPlatform(): boolean {
    return this.hostname.toLowerCase().startsWith('admin.');
  }

  // Slug derivado do host em producao. Em dev (localhost/127), usa fallback local.
  // Em producao, permite sobrepor com tenantSlug do usuario autenticado (quando disponivel).
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

  // Permite sobrepor dinamicamente o tenant para chamadas API (dev e producao).
  // Em producao, usado para sincronizar o tenantSlug do usuario autenticado.
  setDevSlug(slug: string | null): void {
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

    const key = this.devStorageKey;
    let value: string | null | undefined;

    try {
      value = window.sessionStorage.getItem(key);
    } catch {}

    if (!value) {
      try {
        value = window.localStorage.getItem(key);
      } catch {}
    }

    return value?.trim().toLowerCase() || null;
  }

  private persistDevTenant(value: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }

    const key = this.devStorageKey;

    if (!value) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {}
      try {
        window.localStorage.removeItem(key);
      } catch {}
      return;
    }

    let stored = false;
    try {
      window.sessionStorage.setItem(key, value);
      stored = true;
    } catch {}

    if (!stored) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }
  }
}
