import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TinyIntegrationStatus {
  isConnected: boolean;
  companyName?: string;
  companyEmail?: string;
  connectedAt?: string;
  lastSyncAt?: string;
}

export interface TinySyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class TinyIntegrationService {
  private base = `${environment.apiBaseUrl}/client/integrations/tinyerp`;

  constructor(private http: HttpClient) {}

  status(): Observable<TinyIntegrationStatus> {
    return this.http.get<TinyIntegrationStatus>(`${this.base}/status`);
  }

  connectUrl(): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/connect-url`, {});
  }

  disconnect(): Observable<void> {
    return this.http.post<void>(`${this.base}/disconnect`, {});
  }

  syncNow(): Observable<TinySyncResult> {
    return this.http.post<TinySyncResult>(`${this.base}/sync-now`, {});
  }
}
