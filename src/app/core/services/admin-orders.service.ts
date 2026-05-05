import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface MarketplaceShipmentMilestonesResult {
  processingStartedAt?: string | null;
  labelPrintedAt?: string | null;
  separatedAt?: string | null;
  dispatchedAt?: string | null;
}

export interface MarketplaceInternalFulfillmentSummaryResult {
  stage: string;
  label: string;
  milestones: MarketplaceShipmentMilestonesResult;
}

export interface MarketplaceShipmentResult {
  shipmentId: string;
  status?: string | null;
  substatus?: string | null;
  shippingMode?: string | null;
  logisticType?: string | null;
  trackingNumber?: string | null;
  trackingMethod?: string | null;
  trackingUrl?: string | null;
  shippingProvider?: string | null;
  shippedAt?: string | null;
  shipByDeadlineAt?: string | null;
  hasLabel: boolean;
  milestones: MarketplaceShipmentMilestonesResult;
}

export interface MarketplaceShipmentLabelListItem {
  shipmentId: string;
  hasLabel: boolean;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
}

export interface AdminOrderListItem {
  id: string;
  tenantId: string;
  clientId: string;
  clientName?: string | null;
  provider: number;
  sellerId: string;
  mlOrderId: string;
  status: string;
  paidAt?: string | null;
  sabrPaymentConfirmedAt?: string | null;
  shipmentId?: string | null;
  shippingMode?: string | null;
  logisticType?: string | null;
  shipByDeadlineAt?: string | null;
  hasUnmappedItems: boolean;
  totalItems: number;
  hasLabel: boolean;
  riskFlagsJson?: string | null;
  importedAt: string;
}

export interface AdminOrderItemResult {
  id: string;
  mlItemId: string;
  mlVariationId?: string | null;
  sabrVariantSku?: string | null;
  productName?: string | null;
  quantity: number;
  reservedQuantity: number;
  mappingState: string;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  items: AdminOrderItemResult[];
}

export interface AdminFulfillmentOrderResult {
  id: string;
  tenantId: string;
  clientId: string;
  clientName?: string | null;
  mlOrderId: string;
  sellerId: string;
  shipmentId?: string | null;
  shippingMode?: string | null;
  logisticType?: string | null;
  shipByDeadlineAt?: string | null;
  isUrgent: boolean;
  hasLabel: boolean;
  totalItems: number;
  sabrPaymentConfirmedAt: string;
  shipments: MarketplaceShipmentResult[];
  internalFulfillmentSummary?: MarketplaceInternalFulfillmentSummaryResult | null;
}

export interface OrderActionResult {
  orderId: string;
  status: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  listOrders(options?: {
    status?: string | null;
    tenantId?: string | null;
    provider?: string | null;
    from?: string | null;
    to?: string | null;
    skip?: number;
    limit?: number;
  }): Observable<PagedResult<AdminOrderListItem>> {
    let params = new HttpParams();
    params = params.set('skip', Math.max(0, options?.skip ?? 0));
    params = params.set('limit', Math.min(100, Math.max(1, options?.limit ?? 20)));
    if (options?.status) params = params.set('status', options.status);
    if (options?.tenantId) params = params.set('tenantId', options.tenantId);
    if (options?.provider) params = params.set('provider', options.provider);
    if (options?.from) params = params.set('from', options.from);
    if (options?.to) params = params.set('to', options.to);
    return this.http.get<PagedResult<AdminOrderListItem>>(`${this.apiBaseUrl}/admin/orders`, { params });
  }

  getOrder(orderId: string): Observable<AdminOrderDetail> {
    return this.http.get<AdminOrderDetail>(`${this.apiBaseUrl}/admin/orders/${orderId}`);
  }

  confirmPayment(orderId: string, force = false): Observable<any> {
    return this.http.post<any>(`${this.apiBaseUrl}/admin/orders/${orderId}/confirm-payment`, { force });
  }

  cancelOrder(orderId: string, reason?: string | null): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/cancel`, { reason: reason ?? null });
  }

  processRefund(orderId: string): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/refund`, {});
  }

  getLabel(orderId: string): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/admin/orders/${orderId}/label`, { responseType: 'blob' });
  }

  listLabels(orderId: string): Observable<MarketplaceShipmentLabelListItem[]> {
    return this.http.get<MarketplaceShipmentLabelListItem[]>(`${this.apiBaseUrl}/admin/orders/${orderId}/labels`);
  }

  getLabelByShipment(orderId: string, shipmentId: string): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/admin/orders/${orderId}/labels/${shipmentId}`, { responseType: 'blob' });
  }

  dispatch(orderId: string): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/dispatch`, {});
  }

  advanceShipmentMilestone(orderId: string, shipmentId: string, milestone: string): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/shipments/${shipmentId}/milestone`, {
      milestone
    });
  }

  listFulfillment(skip = 0, limit = 20): Observable<PagedResult<AdminFulfillmentOrderResult>> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.http.get<PagedResult<AdminFulfillmentOrderResult>>(`${this.apiBaseUrl}/admin/fulfillment`, { params });
  }
}
