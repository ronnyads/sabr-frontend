import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface MarketplaceShipmentMilestonesResult {
  receivedAt?: string | null;
  paidAt?: string | null;
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
  shipmentScanCode?: string | null;
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
  labelAvailability: string;
  milestones: MarketplaceShipmentMilestonesResult;
}

export interface MarketplaceShipmentLabelListItem {
  shipmentId: string;
  hasLabel: boolean;
  labelAvailability: string;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
}

export interface MarketplaceChannelStatusResult {
  stage: string;
  label: string;
  occurredAt?: string | null;
  rawStatus?: string | null;
}

export interface MarketplaceCancellationRequestResult {
  status: string;
  label: string;
  requestedAt?: string | null;
  requestedBy?: string | null;
  reason?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  isPending: boolean;
}

export interface AdminOrderListItem {
  id: string;
  internalOrderNumber?: string | null;
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
  labelAvailability: string;
  requiresLabelForPayment: boolean;
  canMarkPaid: boolean;
  inventoryStatus: string;
  paymentBlockers: string[];
  canEnterFulfillment: boolean;
  currentInternalStage: string;
  channelStatus: MarketplaceChannelStatusResult;
  cancellationRequest?: MarketplaceCancellationRequestResult | null;
  internalFulfillmentSummary?: MarketplaceInternalFulfillmentSummaryResult | null;
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
  missingQuantity: number;
  availableStock?: number | null;
  stockStatus: string;
  mappingState: string;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  items: AdminOrderItemResult[];
}

export interface AdminFulfillmentOrderResult {
  id: string;
  internalOrderNumber?: string | null;
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
  labelAvailability: string;
  totalItems: number;
  sabrPaymentConfirmedAt: string;
  inventoryStatus: string;
  paymentBlockers: string[];
  items: AdminFulfillmentOrderItemResult[];
  shipments: MarketplaceShipmentResult[];
  channelStatus: MarketplaceChannelStatusResult;
  cancellationRequest?: MarketplaceCancellationRequestResult | null;
  internalFulfillmentSummary?: MarketplaceInternalFulfillmentSummaryResult | null;
}

export interface AdminFulfillmentOrderItemResult {
  id: string;
  sabrVariantSku?: string | null;
  productName?: string | null;
  quantity: number;
  reservedQuantity: number;
  missingQuantity: number;
  availableStock?: number | null;
  stockStatus: string;
}

export interface AdminProcurementOrderResult {
  orderId: string;
  internalOrderNumber?: string | null;
  tenantId: string;
  clientId: string;
  clientName?: string | null;
  provider: number;
  mlOrderId: string;
  inventoryStatus: string;
  importedAt: string;
  items: AdminProcurementOrderItemResult[];
}

export interface AdminProcurementOrderItemResult {
  orderItemId: string;
  sabrVariantSku?: string | null;
  productName?: string | null;
  quantity: number;
  reservedQuantity: number;
  missingQuantity: number;
  availableStock?: number | null;
  stockStatus: string;
}

export interface OrderActionResult {
  orderId: string;
  status: string;
  action?: string | null;
  message?: string | null;
  cancellationRequestStatus?: string | null;
  updatedAt: string;
}

export interface MarketplacePullShipmentLabelResult {
  orderId: string;
  shipmentId: string;
  succeeded: boolean;
  cachedNow: boolean;
  hasLabel: boolean;
  labelAvailability: string;
  reasonCode?: string | null;
  message: string;
}

export interface MarketplaceShipmentScanResult {
  orderId: string;
  internalOrderNumber?: string | null;
  shipmentId: string;
  scanType: string;
  action: string;
  updatedAt: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  listOrders(options?: {
    status?: string | null;
    internalStatus?: string | null;
    channelStatus?: string | null;
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
    if (options?.internalStatus) params = params.set('internalStatus', options.internalStatus);
    if (options?.channelStatus) params = params.set('channelStatus', options.channelStatus);
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

  pullLabel(orderId: string, shipmentId?: string | null): Observable<MarketplacePullShipmentLabelResult> {
    let params = new HttpParams();
    if ((shipmentId ?? '').trim()) {
      params = params.set('shipmentId', shipmentId!.trim());
    }

    return this.http.post<MarketplacePullShipmentLabelResult>(
      `${this.apiBaseUrl}/admin/orders/${orderId}/labels/pull`,
      {},
      { params }
    );
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

  listProcurement(skip = 0, limit = 20): Observable<PagedResult<AdminProcurementOrderResult>> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.http.get<PagedResult<AdminProcurementOrderResult>>(`${this.apiBaseUrl}/admin/orders/procurement`, { params });
  }

  scanShipment(value: string): Observable<MarketplaceShipmentScanResult> {
    return this.http.post<MarketplaceShipmentScanResult>(`${this.apiBaseUrl}/admin/fulfillment/scan`, { value });
  }

  getPackingLabel(orderId: string, shipmentId: string): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/admin/fulfillment/${orderId}/packing-labels/${shipmentId}`, {
      responseType: 'blob'
    });
  }

  approveCancellationRequest(orderId: string): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/cancellation-request/approve`, {});
  }

  rejectCancellationRequest(orderId: string): Observable<OrderActionResult> {
    return this.http.post<OrderActionResult>(`${this.apiBaseUrl}/admin/orders/${orderId}/cancellation-request/reject`, {});
  }
}
