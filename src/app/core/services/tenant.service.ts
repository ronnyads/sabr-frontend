import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly reserved = ['admin', 'www', 'api'];
  private readonly hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  private cachedSlug: string | null | undefined;

  get isPlatform(): boolean {
    return this.hostname.toLowerCase().startsWith('admin.');
  }

  /**
   * Slug derivado do host em produção. Em dev (localhost/127) usa environment.devTenant.
   */
  get slug(): string | null {
    if (this.cachedSlug !== undefined) return this.cachedSlug;

    const host = this.hostname.toLowerCase();

    // Dev/local: permite fallback configurado
    if (this.isLocalhost(host)) {
      const devTenant = environment.devTenant?.trim();
      this.cachedSlug = devTenant ?? null;
      return this.cachedSlug;
    }

    const label = host.split('.')[0];
    if (!label || this.reserved.includes(label)) {
      this.cachedSlug = null;
      return null;
    }

    this.cachedSlug = label;
    return this.cachedSlug;
  }

  /**
   * Apenas em dev: permite sobrepor via query ?tenant=
   */
  setDevSlug(slug: string | null) {
    if (!this.isLocalhost(this.hostname)) return;
    this.cachedSlug = slug?.trim() ?? null;
  }

  private isLocalhost(host: string): boolean {
    return host === 'localhost' || host.startsWith('127.');
  }
}
