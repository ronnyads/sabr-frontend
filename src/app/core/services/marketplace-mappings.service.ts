import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MarketplaceMappingResult {
  id: string;
  provider: number;
  integrationId?: string | null;
  sellerId?: string | null;
  externalItemId: string;
  externalVariationId?: string | null;
  sabrVariantSku: string;
  baseSku?: string | null;
  productName?: string | null;
  variantName?: string | null;
  channelSku?: string | null;
  action: string;
  ordersAffected: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceUnmappedItem {
  mappingKey: string;
  provider: number;
  integrationId?: string | null;
  sellerId?: string | null;
  externalItemId: string;
  externalVariationId?: string | null;
  channelSku?: string | null;
  productName?: string | null;
  variantName?: string | null;
  mappingReason: string;
  ordersAffected: number;
  totalUnits: number;
  latestImportedAt: string;
}

export interface MarketplaceUpsertMappingRequest {
  provider: string;
  integrationId?: string | null;
  sellerId?: string | null;
  externalItemId: string;
  externalVariationId?: string | null;
  selectedCatalogSku: string;
}

@Injectable({ providedIn: 'root' })
export class MarketplaceMappingsService {
  private readonly base = `${environment.apiBaseUrl}/client/marketplace-mappings`;

  constructor(private readonly http: HttpClient) {}

  listMappings(provider: string, sellerId?: string | null, integrationId?: string | null): Observable<MarketplaceMappingResult[]> {
    let params = new HttpParams().set('provider', provider);
    if ((sellerId ?? '').trim()) {
      params = params.set('sellerId', sellerId!.trim());
    }
    if ((integrationId ?? '').trim()) {
      params = params.set('integrationId', integrationId!.trim());
    }

    return this.http.get<MarketplaceMappingResult[]>(this.base, { params });
  }

  listUnmappedItems(provider: string, sellerId?: string | null, integrationId?: string | null): Observable<MarketplaceUnmappedItem[]> {
    let params = new HttpParams().set('provider', provider);
    if ((sellerId ?? '').trim()) {
      params = params.set('sellerId', sellerId!.trim());
    }
    if ((integrationId ?? '').trim()) {
      params = params.set('integrationId', integrationId!.trim());
    }

    return this.http.get<MarketplaceUnmappedItem[]>(`${this.base}/unmapped-items`, { params });
  }

  createMapping(request: MarketplaceUpsertMappingRequest): Observable<MarketplaceMappingResult> {
    return this.http.post<MarketplaceMappingResult>(this.base, request);
  }

  deleteMapping(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
