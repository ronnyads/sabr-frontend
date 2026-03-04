import { Injectable } from '@angular/core';

export interface AdminTenantContext {
  tenantId: string;
  clientId?: string | null;
  label?: string | null;
  setAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminTenantContextService {
  private readonly storageKey = 'admin.currentTenant';

  get(): AdminTenantContext | null {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as AdminTenantContext;
      if (!parsed?.tenantId) {
        return null;
      }

      return {
        tenantId: parsed.tenantId,
        clientId: typeof parsed.clientId === 'string' && parsed.clientId.trim() ? parsed.clientId.trim() : null,
        label: parsed.label ?? null,
        setAt: parsed.setAt ?? new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  set(tenantId: string, label?: string | null, clientId?: string | null): void {
    const normalizedTenantId = (tenantId ?? '').trim();
    if (!normalizedTenantId) {
      return;
    }

    const normalizedClientId = (clientId ?? '').trim();

    const context: AdminTenantContext = {
      tenantId: normalizedTenantId,
      clientId: normalizedClientId || null,
      label: label?.trim() || null,
      setAt: new Date().toISOString()
    };

    localStorage.setItem(this.storageKey, JSON.stringify(context));
  }

  clear(): void {
    localStorage.removeItem(this.storageKey);
  }
}
