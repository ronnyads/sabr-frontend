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

@Injectable({ providedIn: 'root' })
export class AdminIntegrationsHubService {
  private base = `${environment.apiBaseUrl}/api/v1/admin/integrations`;

  constructor(private http: HttpClient) {}

  listIntegrations(): Observable<IntegrationCard[]> {
    return this.http.get<IntegrationCard[]>(this.base);
  }

  listMlClients(skip = 0, limit = 20, search = ''): Observable<PagedIntegrationClients> {
    const params: any = { skip, limit };
    if (search) params.search = search;
    return this.http.get<PagedIntegrationClients>(`${this.base}/mercadolivre/clients`, { params });
  }

  listTinyClients(skip = 0, limit = 20, search = ''): Observable<PagedIntegrationClients> {
    const params: any = { skip, limit };
    if (search) params.search = search;
    return this.http.get<PagedIntegrationClients>(`${this.base}/tinyerp/clients`, { params });
  }

  disconnectMl(clientId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/mercadolivre/clients/${clientId}`);
  }

  disconnectTiny(clientId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tinyerp/clients/${clientId}`);
  }
}
