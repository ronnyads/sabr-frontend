import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface MercadoLivreConnectUrlResult {
  url: string;
}

export interface MercadoLivreConnectionStatusResult {
  integrationId: string;
  sellerId: string;
  nickname?: string | null;
  tokenExpiresAt: string;
  lastSyncAt?: string | null;
}

export interface MercadoLivreIntegrationStatusResult {
  connected: boolean;
  connections: MercadoLivreConnectionStatusResult[];
  mappingsCount: number;
  ordersCount: number;
  unmappedItemsCount: number;
  lastSyncAt?: string | null;
}

export interface MercadoLivreListingMapResult {
  id: string;
  sellerId: string;
  mlItemId: string;
  mlVariationId?: string | null;
  sabrVariantSku: string;
  createdAt: string;
  updatedAt: string;
}

export interface MercadoLivreCreateMappingRequest {
  sellerId: string;
  mlItemId: string;
  mlVariationId?: string | null;
  sabrVariantSku: string;
}

export interface MercadoLivreSyncNowResult {
  ordersUpserted: number;
  itemsUpserted: number;
  reservationsCreated: number;
}

export interface MarketplaceOrderListItemResult {
  id: string;
  provider: string;
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
  riskFlagsJson?: string | null;
  importedAt: string;
}

export interface MarketplaceMarkPaidResult {
  orderId: string;
  alreadyPaid: boolean;
  sabrPaymentConfirmedAt?: string | null;
  riskFlagsJson?: string | null;
}

export interface MarketplacePaymentConfirmationRequiredResult {
  shipByDeadlineAt?: string | null;
  cutoffLocalTime: string;
  nowLocal: string;
  message: string;
}

export interface MercadoLivrePublishValidateRequest {
  catalogId?: string | null;
  planId?: string | null;
  sabrVariantSkus?: string[] | null;
}

export interface MercadoLivrePublishValidationItemResult {
  sabrVariantSku: string;
  eligible: boolean;
  reasons: string[];
}

export interface MercadoLivrePublishValidateResult {
  total: number;
  eligible: number;
  ineligible: number;
  items: MercadoLivrePublishValidationItemResult[];
}

export interface MercadoLivrePublishRequest {
  sellerId?: string | null;
  catalogId?: string | null;
  planId?: string | null;
  sabrVariantSkus?: string[] | null;
}

export interface MercadoLivrePublishItemResult {
  sellerId: string;
  sabrVariantSku: string;
  status: string;
  mlItemId?: string | null;
  mlVariationId?: string | null;
  reasons: string[];
  message?: string | null;
}

export interface MercadoLivrePublishResult {
  total: number;
  published: number;
  alreadyMapped: number;
  skipped: number;
  failed: number;
  items: MercadoLivrePublishItemResult[];
}

export interface MercadoLivreListListingsResult {
  total: number;
  items: MercadoLivreListingItemDetails[];
}

export interface MercadoLivreListingItemDetails {
  id: string;
  sellerId: string;
  mlItemId: string;
  mlVariationId?: string | null;
  sabrVariantSku: string;
  productName?: string | null;
  catalogPriceCents: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MercadoLivreIntegrationService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  status(): Observable<MercadoLivreIntegrationStatusResult> {
    return this.http.get<MercadoLivreIntegrationStatusResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/status`
    );
  }

  connectUrl(returnUrl?: string | null): Observable<MercadoLivreConnectUrlResult> {
    return this.http.post<MercadoLivreConnectUrlResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/connect-url`,
      { returnUrl: returnUrl ?? null }
    );
  }

  disconnect(sellerId?: string | null): Observable<void> {
    return this.http.post<void>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/disconnect`,
      { sellerId: sellerId ?? null }
    );
  }

  syncNow(sellerId?: string | null): Observable<MercadoLivreSyncNowResult> {
    return this.http.post<MercadoLivreSyncNowResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/sync-now`,
      { sellerId: sellerId ?? null }
    );
  }

  listMappings(sellerId?: string | null): Observable<MercadoLivreListingMapResult[]> {
    let params = new HttpParams();
    const normalizedSellerId = (sellerId ?? '').trim();
    if (normalizedSellerId) {
      params = params.set('sellerId', normalizedSellerId);
    }

    return this.http.get<MercadoLivreListingMapResult[]>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/mappings`,
      { params }
    );
  }

  createMapping(request: MercadoLivreCreateMappingRequest): Observable<MercadoLivreListingMapResult> {
    return this.http.post<MercadoLivreListingMapResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/mappings`,
      request
    );
  }

  deleteMapping(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/client/integrations/mercadolivre/mappings/${id}`);
  }

  listOrders(options?: {
    status?: string | null;
    logisticType?: string | null;
    skip?: number;
    limit?: number;
  }): Observable<PagedResult<MarketplaceOrderListItemResult>> {
    let params = new HttpParams();
    params = params.set('provider', 'MercadoLivre');
    params = params.set('skip', Math.max(0, Math.trunc(options?.skip ?? 0)));
    params = params.set('limit', Math.min(200, Math.max(1, Math.trunc(options?.limit ?? 20))));

    const status = (options?.status ?? '').trim();
    if (status) {
      params = params.set('status', status);
    }

    const logisticType = (options?.logisticType ?? '').trim();
    if (logisticType) {
      params = params.set('logisticType', logisticType);
    }

    return this.http.get<PagedResult<MarketplaceOrderListItemResult>>(`${this.apiBaseUrl}/client/orders/marketplace`, {
      params
    });
  }

  markPaid(orderId: string, force = false): Observable<MarketplaceMarkPaidResult> {
    return this.http.post<MarketplaceMarkPaidResult>(
      `${this.apiBaseUrl}/client/orders/${orderId}/mark-paid`,
      { force }
    );
  }

  validatePublish(request: MercadoLivrePublishValidateRequest): Observable<MercadoLivrePublishValidateResult> {
    return this.http.post<MercadoLivrePublishValidateResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/publish/validate`,
      request
    );
  }

  publish(request: MercadoLivrePublishRequest): Observable<MercadoLivrePublishResult> {
    return this.http.post<MercadoLivrePublishResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/publish`,
      request
    );
  }

  listListings(sellerId?: string | null): Observable<MercadoLivreListListingsResult> {
    let params = new HttpParams();
    const normalizedSeller = (sellerId ?? '').trim();
    if (normalizedSeller) {
      params = params.set('sellerId', normalizedSeller);
    }

    return this.http.get<MercadoLivreListListingsResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/listings`,
      { params }
    );
  }

  reconcile(sellerId?: string | null): Observable<MercadoLivreSyncNowResult> {
    return this.http.post<MercadoLivreSyncNowResult>(
      `${this.apiBaseUrl}/client/integrations/mercadolivre/reconcile`,
      { sellerId: sellerId ?? null }
    );
  }
}
