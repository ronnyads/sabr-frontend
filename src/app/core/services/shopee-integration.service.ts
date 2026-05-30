import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ShopeeIntegrationStatus {
  isConnected: boolean;
  shopName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
  ordersCount?: number;
}

export interface ShopeeConnectUrlResult {
  url: string;
}

export interface ShopeeSyncResult {
  ordersFetched: number;
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ShopeeIntegrationService {
  private readonly base = `${environment.apiBaseUrl}/client/integrations/shopee`;

  constructor(private readonly http: HttpClient) {}

  status(): Observable<ShopeeIntegrationStatus> {
    return this.http.get<ShopeeIntegrationStatus>(`${this.base}/status`);
  }

  connectUrl(returnUrl?: string): Observable<ShopeeConnectUrlResult> {
    return this.http.post<ShopeeConnectUrlResult>(`${this.base}/connect-url`, { returnUrl });
  }

  disconnect(): Observable<void> {
    return this.http.post<void>(`${this.base}/disconnect`, {});
  }

  syncNow(): Observable<ShopeeSyncResult> {
    return this.http.post<ShopeeSyncResult>(`${this.base}/sync-now`, {});
  }
}
