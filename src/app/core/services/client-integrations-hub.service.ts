import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientIntegrationCard {
  provider: number;
  slug: string;
  category: 'Operacional' | 'Financeiro';
  name: string;
  description: string;
  isConnected: boolean;
  connectedAt?: string;
  lastSyncAt?: string;
  details?: string;
  healthStatus?: 'NOT_CONNECTED' | 'PENDING' | 'VERIFIED' | 'REAUTH_REQUIRED';
}

@Injectable({ providedIn: 'root' })
export class ClientIntegrationsHubService {
  private base = `${environment.apiBaseUrl}/client/integrations`;

  constructor(private http: HttpClient) {}

  listIntegrations(): Observable<ClientIntegrationCard[]> {
    return this.http.get<ClientIntegrationCard[]>(this.base);
  }
}
