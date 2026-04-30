import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ShopifyIntegrationStatus {
  isConnected: boolean;
  shop?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

export interface ShopifyConnectUrlResult {
  url: string;
}

export interface ShopifySyncResult {
  ordersFetched: number;
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ShopifyIntegrationService {
  private base = `${environment.apiBaseUrl}/client/integrations/shopify`;

  constructor(private http: HttpClient) {}

  status(): Observable<ShopifyIntegrationStatus> {
    return this.http.get<ShopifyIntegrationStatus>(`${this.base}/status`);
  }

  connectUrl(shop: string): Observable<ShopifyConnectUrlResult> {
    return this.http.post<ShopifyConnectUrlResult>(`${this.base}/connect-url`, { shop });
  }

  disconnect(): Observable<void> {
    return this.http.post<void>(`${this.base}/disconnect`, {});
  }

  syncNow(): Observable<ShopifySyncResult> {
    return this.http.post<ShopifySyncResult>(`${this.base}/sync-now`, {});
  }
}
