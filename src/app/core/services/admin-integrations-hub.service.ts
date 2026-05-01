import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IntegrationCard {
  provider: number;
  name: string;
  description: string;
  connectedCount: number;
}

export interface IntegrationClient {
  clientId: string;
  tenantId: string;
  tenantSlug: string;
  clientName: string;
  isConnected: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  sellerOrCompanyInfo?: string;
}

export interface PagedIntegrationClients {
  items: IntegrationClient[];
  total: number;
}

export type IntegrationProviderSlug = 'mercadolivre' | 'tinyerp' | 'shopify' | 'tiktokshop';

@Injectable({ providedIn: 'root' })
export class AdminIntegrationsHubService {
  private base = `${environment.apiBaseUrl}/admin/integrations`;

  constructor(private http: HttpClient) {}

  listIntegrations(): Observable<IntegrationCard[]> {
    return this.http.get<IntegrationCard[]>(this.base);
  }

  listClients(provider: IntegrationProviderSlug, skip = 0, limit = 20, search = ''): Observable<PagedIntegrationClients> {
    const params: Record<string, string | number> = { skip, limit };
    if (search) {
      params['search'] = search;
    }

    return this.http.get<PagedIntegrationClients>(`${this.base}/${provider}/clients`, { params });
  }

  disconnect(provider: IntegrationProviderSlug, clientId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${provider}/clients/${clientId}`);
  }

  listMlClients(skip = 0, limit = 20, search = ''): Observable<PagedIntegrationClients> {
    return this.listClients('mercadolivre', skip, limit, search);
  }

  listTinyClients(skip = 0, limit = 20, search = ''): Observable<PagedIntegrationClients> {
    return this.listClients('tinyerp', skip, limit, search);
  }

  disconnectMl(clientId: string): Observable<void> {
    return this.disconnect('mercadolivre', clientId);
  }

  disconnectTiny(clientId: string): Observable<void> {
    return this.disconnect('tinyerp', clientId);
  }
}
