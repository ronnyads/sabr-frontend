import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface MarketplaceOrderItemDetail {
  id: string;
  mlItemId: string;
  mlVariationId?: string | null;
  sabrVariantSku?: string | null;
  productName?: string | null;
  quantity: number;
  mappingState: string;
}

export interface MarketplaceOrderDetail {
  id: string;
  provider: string;
  sellerId: string;
  mlOrderId: string;
  status: string;
  paidAt?: string | null;
  sabrPaymentConfirmedAt?: string | null;
  shipmentId?: string | null;
  shippingMode?: string | null;
  logisticType?: string | null;
  shipByDeadlineAt?: string | null;
  importedAt: string;
  canCancel: boolean;
  canRefund: boolean;
  items: MarketplaceOrderItemDetail[];
}

export interface OrderActionResult {
  orderId: string;
  status: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceOrdersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  listOrders(options?: {
    status?: string | null;
    provider?: string | null;
    skip?: number;
    limit?: number;
  }): Observable<PagedResult<any>> {
    let params = new HttpParams();
    params = params.set('skip', Math.max(0, options?.skip ?? 0));
    params = params.set('limit', Math.min(100, Math.max(1, options?.limit ?? 20)));
    const status = (options?.status ?? '').trim();
    if (status) params = params.set('status', status);
    const provider = (options?.provider ?? '').trim();
    if (provider) params = params.set('provider', provider);
    return this.http.get<PagedResult<any>>(`${this.apiBaseUrl}/client/orders/marketplace`, { params });
  }

  getOrder(orderId: string): Observable<MarketplaceOrderDetail> {
    return this.http.get<MarketplaceOrderDetail>(`${this.apiBaseUrl}/client/orders/marketplace/${orderId}`);
  }

  cancelOrder(orderId: string, reason?: string | null): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(
      `${this.apiBaseUrl}/client/orders/marketplace/${orderId}/cancel`,
      { reason: reason ?? null }
    );
  }

  requestRefund(orderId: string, reason?: string | null): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(
      `${this.apiBaseUrl}/client/orders/marketplace/${orderId}/refund-request`,
      { reason: reason ?? null }
    );
  }

  markPaid(orderId: string, force = false): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(
      `${this.apiBaseUrl}/client/orders/marketplace/${orderId}/mark-paid`,
      { force }
    );
  }
}
