import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SentinelHorizonBucket { level: string; count: number; }
export interface SentinelSummary {
  serverNow: string; totalOpen: number; dueToday: number; picking: number;
  packedAwaitingConfirmation: number; critical: number; overdue: number;
  integrationRisk: number; horizon: SentinelHorizonBucket[];
}
export interface SentinelShipment {
  shipmentId: string; clientId: string; clientName: string; provider: number; sellerId: number;
  orderId?: string | null; internalOrderNumber?: string | null; internalState: string;
  externalState: string; riskLevel: string; cause: string; freshness: string;
  dispatchDeadline?: string | null; deadlineVersion?: number | null; deadlineHash?: string | null;
  deadlineSource?: string | null; deadlineQueriedAt?: string | null; lastMarketplaceSyncAt?: string | null;
  minutesRemaining?: number | null; operator?: string | null; labelAvailable: boolean;
  labelPrintedAt?: string | null; pickingStartedAt?: string | null; separatedAt?: string | null; packedAt?: string | null;
}
export interface SentinelPage { serverNow: string; total: number; items: SentinelShipment[]; }
export interface SentinelTimeline { type: string; label: string; at: string; source: string; actor?: string | null; }
export interface SentinelDetail { serverNow: string; shipment: SentinelShipment; timeline: SentinelTimeline[]; deadlineHistory: unknown[]; }

@Injectable({ providedIn: 'root' })
export class SentinelService {
  private readonly base = `${environment.apiBaseUrl}/admin/sentinel`;
  constructor(private readonly http: HttpClient) {}
  getSummary(filters: Record<string, string> = {}): Observable<SentinelSummary> {
    return this.http.get<SentinelSummary>(`${this.base}/summary`, { params: new HttpParams({ fromObject: filters }) });
  }
  getShipments(filters: Record<string, string> = {}): Observable<SentinelPage> {
    return this.http.get<SentinelPage>(`${this.base}/shipments`, { params: new HttpParams({ fromObject: filters }) });
  }
  getShipment(id: string): Observable<SentinelDetail> {
    return this.http.get<SentinelDetail>(`${this.base}/shipments/${encodeURIComponent(id)}`);
  }
}
