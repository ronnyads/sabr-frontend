import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface TikTokShopIntegrationStatus {
  isConnected: boolean;
  shopName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
  ordersCount: number;
  mappingsCount: number;
  requiresReconnect?: boolean;
  connectionWarning?: string | null;
}

export interface TikTokShopConnectUrlResult {
  url: string;
}

export interface TikTokShopSyncResult {
  ordersUpserted: number;
  itemsUpserted: number;
}

export interface TikTokShopMappingResult {
  id: string;
  tikTokItemId: string;
  tikTokSkuId?: string | null;
  sabrVariantSku: string;
  baseSku?: string | null;
  productName?: string | null;
  variantName?: string | null;
  createdAt: string;
  updatedAt: string;
  action: string;
  ordersAffected: number;
}

export interface TikTokShopCreateMappingRequest {
  tikTokItemId: string;
  tikTokSkuId?: string | null;
  sabrVariantSku: string;
}

export interface TikTokShopOrderListItem {
  id: string;
  provider: string;
  sellerId: string;
  mlOrderId: string;
  status: string;
  paidAt?: string | null;
  hasUnmappedItems: boolean;
  totalItems: number;
  importedAt: string;
}

export interface TikTokShopUnmappedItem {
  mappingKey: string;
  tikTokItemId: string;
  tikTokSkuId?: string | null;
  productName?: string | null;
  variantName?: string | null;
  ordersAffected: number;
  totalUnits: number;
  latestImportedAt: string;
}

export interface TikTokShopPublishRequest {
  sabrVariantSkus: string[];
  tikTokCategoryId: string;
}

export interface TikTokShopPublishValidateItem {
  sabrVariantSku: string;
  productName?: string;
  priceCents: number;
  imageCount: number;
  eligible: boolean;
  alreadyMapped: boolean;
  reasons: string[];
}

export interface TikTokShopPublishValidateResult {
  total: number;
  eligible: number;
  ineligible: number;
  items: TikTokShopPublishValidateItem[];
}

export interface TikTokShopPublishItemResult {
  sabrVariantSku: string;
  tikTokItemId?: string;
  tikTokSkuId?: string;
  status: string;
  message?: string;
}

export interface TikTokShopPublishResult {
  total: number;
  published: number;
  alreadyMapped: number;
  failed: number;
  items: TikTokShopPublishItemResult[];
}

export interface TikTokShopListingResult {
  id: string;
  tikTokItemId: string;
  tikTokSkuId?: string;
  sabrVariantSku: string;
  productName?: string;
  createdAt: string;
}

export interface TikTokShopCategoryResult {
  id: string;
  parentId: string;
  localName: string;
  isLeaf: boolean;
  permissionStatuses: string[];
}

@Injectable({ providedIn: 'root' })
export class TikTokShopIntegrationService {
  private readonly base = `${environment.apiBaseUrl}/client/integrations/tiktokshop`;
  private readonly ordersBase = `${environment.apiBaseUrl}/client/orders/marketplace`;

  constructor(private readonly http: HttpClient) {}

  status(): Observable<TikTokShopIntegrationStatus> {
    return this.http.get<TikTokShopIntegrationStatus>(`${this.base}/status`);
  }

  connectUrl(returnUrl?: string): Observable<TikTokShopConnectUrlResult> {
    return this.http.post<TikTokShopConnectUrlResult>(`${this.base}/connect-url`, { returnUrl });
  }

  disconnect(): Observable<void> {
    return this.http.post<void>(`${this.base}/disconnect`, {});
  }

  reset(): Observable<void> {
    return this.http.post<void>(`${this.base}/reset`, {});
  }

  syncNow(): Observable<TikTokShopSyncResult> {
    return this.http.post<TikTokShopSyncResult>(`${this.base}/sync-now`, {});
  }

  listMappings(): Observable<TikTokShopMappingResult[]> {
    return this.http.get<TikTokShopMappingResult[]>(`${this.base}/mappings`);
  }

  listUnmappedItems(): Observable<TikTokShopUnmappedItem[]> {
    return this.http.get<TikTokShopUnmappedItem[]>(`${this.base}/unmapped-items`);
  }

  createMapping(request: TikTokShopCreateMappingRequest): Observable<TikTokShopMappingResult> {
    return this.http.post<TikTokShopMappingResult>(`${this.base}/mappings`, request);
  }

  deleteMapping(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/mappings/${id}`);
  }

  validatePublish(request: TikTokShopPublishRequest): Observable<TikTokShopPublishValidateResult> {
    return this.http.post<TikTokShopPublishValidateResult>(`${this.base}/publish/validate`, request);
  }

  publish(request: TikTokShopPublishRequest): Observable<TikTokShopPublishResult> {
    return this.http.post<TikTokShopPublishResult>(`${this.base}/publish`, request);
  }

  listListings(): Observable<TikTokShopListingResult[]> {
    return this.http.get<TikTokShopListingResult[]>(`${this.base}/listings`);
  }

  getCategories(): Observable<TikTokShopCategoryResult[]> {
    return this.http.get<TikTokShopCategoryResult[]>(`${this.base}/categories`);
  }

  listOrders(options?: { status?: string | null; skip?: number; limit?: number }): Observable<PagedResult<TikTokShopOrderListItem>> {
    let params = new HttpParams();
    params = params.set('provider', 'TikTokShop');
    params = params.set('skip', Math.max(0, Math.trunc(options?.skip ?? 0)));
    params = params.set('limit', Math.min(100, Math.max(1, Math.trunc(options?.limit ?? 20))));

    const status = (options?.status ?? '').trim();
    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<PagedResult<TikTokShopOrderListItem>>(this.ordersBase, { params });
  }
}
