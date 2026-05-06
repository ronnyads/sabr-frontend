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

export interface MarketplaceOrderItemDetail {
  id: string;
  mlItemId: string;
  mlVariationId?: string | null;
  channelSku?: string | null;
  sabrVariantSku?: string | null;
  productName?: string | null;
  quantity: number;
  reservedQuantity: number;
  missingQuantity: number;
  availableStock?: number | null;
  stockStatus: string;
  mappingState: string;
  mappingReason?: string | null;
}

export interface MarketplaceOrderListItem {
  id: string;
  internalOrderNumber?: string | null;
  provider: number;
  sellerId: string;
  mlOrderId: string;
  status: string;
  paidAt?: string | null;
  sabrPaymentConfirmedAt?: string | null;
  shippingMode?: string | null;
  logisticType?: string | null;
  shipByDeadlineAt?: string | null;
  hasUnmappedItems: boolean;
  totalItems: number;
  reservedItems: number;
  hasLabel: boolean;
  labelAvailability: string;
  requiresLabelForPayment: boolean;
  canMarkPaid: boolean;
  inventoryStatus: string;
  paymentBlockers: string[];
  canEnterFulfillment: boolean;
  shipmentsCount: number;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shippingProvider?: string | null;
  currentInternalStage: string;
  currentChannelStage: string;
  channelStatus: MarketplaceChannelStatusResult;
  cancellationRequest?: MarketplaceCancellationRequestResult | null;
  internalFulfillmentSummary?: MarketplaceInternalFulfillmentSummaryResult | null;
  riskFlagsJson?: string | null;
  importedAt: string;
}

export interface MarketplaceOrderDetail {
  id: string;
  internalOrderNumber?: string | null;
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
  importedAt: string;
  canCancel: boolean;
  canRefund: boolean;
  requiresLabelForPayment: boolean;
  canMarkPaid: boolean;
  inventoryStatus: string;
  paymentBlockers: string[];
  canEnterFulfillment: boolean;
  canAutoCancel: boolean;
  currentInternalStage: string;
  currentChannelStage: string;
  channelStatus: MarketplaceChannelStatusResult;
  cancellationRequest?: MarketplaceCancellationRequestResult | null;
  items: MarketplaceOrderItemDetail[];
  shipments: MarketplaceShipmentResult[];
  internalFulfillmentSummary?: MarketplaceInternalFulfillmentSummaryResult | null;
}

export interface MarketplaceShipmentLabelListItem {
  shipmentId: string;
  hasLabel: boolean;
  labelAvailability: string;
  shippingProvider?: string | null;
  trackingNumber?: string | null;
  status?: string | null;
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

export interface MarketplacePullLabelsBulkResult {
  total: number;
  succeeded: number;
  failed: number;
  items: MarketplacePullShipmentLabelResult[];
}

@Injectable({ providedIn: 'root' })
export class MarketplaceOrdersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  listOrders(options?: {
    status?: string | null;
    internalStatus?: string | null;
    channelStatus?: string | null;
    provider?: string | null;
    skip?: number;
    limit?: number;
  }): Observable<PagedResult<MarketplaceOrderListItem>> {
    let params = new HttpParams();
    params = params.set('skip', Math.max(0, options?.skip ?? 0));
    params = params.set('limit', Math.min(100, Math.max(1, options?.limit ?? 20)));
    const status = (options?.status ?? '').trim();
    if (status) params = params.set('status', status);
    const internalStatus = (options?.internalStatus ?? '').trim();
    if (internalStatus) params = params.set('internalStatus', internalStatus);
    const channelStatus = (options?.channelStatus ?? '').trim();
    if (channelStatus) params = params.set('channelStatus', channelStatus);
    const provider = (options?.provider ?? '').trim();
    if (provider) params = params.set('provider', provider);
    return this.http.get<PagedResult<MarketplaceOrderListItem>>(`${this.apiBaseUrl}/client/orders/marketplace`, { params });
  }

  getOrder(orderId: string): Observable<MarketplaceOrderDetail> {
    return this.http.get<MarketplaceOrderDetail>(`${this.apiBaseUrl}/client/orders/marketplace/${orderId}`);
  }

  listLabels(orderId: string): Observable<MarketplaceShipmentLabelListItem[]> {
    return this.http.get<MarketplaceShipmentLabelListItem[]>(`${this.apiBaseUrl}/client/orders/marketplace/${orderId}/labels`);
  }

  downloadLabel(orderId: string, shipmentId: string): Observable<Blob> {
    return this.http.get(`${this.apiBaseUrl}/client/orders/marketplace/${orderId}/labels/${shipmentId}`, {
      responseType: 'blob'
    });
  }

  pullLabel(orderId: string, shipmentId?: string | null): Observable<MarketplacePullShipmentLabelResult> {
    let params = new HttpParams();
    if ((shipmentId ?? '').trim()) {
      params = params.set('shipmentId', shipmentId!.trim());
    }

    return this.http.post<MarketplacePullShipmentLabelResult>(
      `${this.apiBaseUrl}/client/orders/marketplace/${orderId}/labels/pull`,
      {},
      { params }
    );
  }

  pullLabelsBulk(orderIds: string[]): Observable<MarketplacePullLabelsBulkResult> {
    return this.http.post<MarketplacePullLabelsBulkResult>(
      `${this.apiBaseUrl}/client/orders/marketplace/labels/pull`,
      { orderIds }
    );
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
      `${this.apiBaseUrl}/client/orders/${orderId}/mark-paid`,
      { force }
    );
  }
}
