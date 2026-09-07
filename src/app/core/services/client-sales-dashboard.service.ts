import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientSalesDailyResult { date: string; orders: number; units: number; revenue: number; }
export interface ClientSalesSkuResult { sku: string; productName?: string | null; orders: number; units: number; revenue: number; isMapped: boolean; }
export interface ClientSalesStatusResult { status: string; orders: number; percentage: number; }

export interface ClientSalesDashboardResult {
  from: string;
  to: string;
  generatedAt: string;
  lastSyncedAt?: string | null;
  currencyId: string;
  totalOrders: number;
  paidOrders: number;
  totalUnits: number;
  grossRevenue: number;
  marketplaceFees: number;
  netRevenue: number;
  averageTicket: number;
  cancelledOrders: number;
  unmappedUnits: number;
  ordersChangePercent: number;
  revenueChangePercent: number;
  dailySales: ClientSalesDailyResult[];
  topSkus: ClientSalesSkuResult[];
  statuses: ClientSalesStatusResult[];
}

@Injectable({ providedIn: 'root' })
export class ClientSalesDashboardService {
  constructor(private readonly http: HttpClient) {}

  getSales(options: { from: Date; to: Date; provider?: string | null }): Observable<ClientSalesDashboardResult> {
    let params = new HttpParams().set('from', options.from.toISOString()).set('to', options.to.toISOString());
    if (options.provider) params = params.set('provider', options.provider);
    return this.http.get<ClientSalesDashboardResult>(`${environment.apiBaseUrl}/client/dashboard/sales`, { params });
  }
}
