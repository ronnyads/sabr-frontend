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
  thumbnailUrl?: string | null;
  mappingReason: string;
  ordersAffected: number;
  totalUnits: number;
  latestImportedAt: string;
  isExternalProduct?: boolean;
  externalSupplierName?: string | null;
  externalUnitCostCents?: number | null;
  externalCurrencyId?: string | null;
  externalCostPending?: boolean;
}

export interface MarketplaceExternalSupplierRequest {
  provider: string;
  integrationId?: string | null;
  sellerId: string;
  externalItemId: string;
  externalVariationId?: string | null;
  supplierName: string;
  reason?: string | null;
  unitCostCents: number;
  currencyId: string;
}

export interface MarketplaceExternalSupplierResult {
  classificationId: string;
  version: number;
  classification: string;
  supplierName: string;
  reason?: string | null;
  unitCostCents?: number | null;
  currencyId?: string | null;
  effectiveAt: string;
  itemsAffected: number;
}

export interface MarketplaceUpsertMappingRequest {
  provider: string;
  integrationId?: string | null;
  sellerId?: string | null;
  externalItemId: string;
  externalVariationId?: string | null;
  selectedCatalogSku: string;
}

export interface MarketplaceMappingReanalysisResult {
  itemsExamined: number;
  itemsMapped: number;
  itemsRemaining: number;
  ordersReleased: number;
}

export interface MarketplaceListingFieldCapability {
  editable: boolean;
  reasonCode?: string | null;
  reason?: string | null;
  currentValue?: unknown;
  allowedValues: string[];
}

export interface MarketplaceListingWorkspace {
  listing: {
    mappingId: string;
    mappingVersion: number;
    model: number;
    masterSku: string;
    channelSku?: string | null;
    title: string;
    price: number;
    availableQuantity: number;
    soldQuantity: number;
    status: string;
    permalink?: string | null;
    isCatalogListing: boolean;
    identity: {
      provider: number;
      integrationId: string;
      sellerId: number;
      itemId: string;
      variationId?: string | null;
      userProductId?: string | null;
    };
  };
  capabilities: {
    mappingId: string;
    mappingVersion: number;
    model: number;
    evaluationHash: string;
    evaluatedAt: string;
    expiresAt: string;
    fields: Record<string, MarketplaceListingFieldCapability>;
  };
}

export interface MarketplaceListingChangeSet {
  evaluationHash: string;
  mappingVersion: number;
  title?: string;
  price?: number;
  description?: string;
}

export interface MarketplaceListingChangeDraft {
  draftId: string;
  mappingId: string;
  status: string;
  changes: MarketplaceListingChangeSet;
  createdAt: string;
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

  reanalyzePendingItems(provider: string): Observable<MarketplaceMappingReanalysisResult> {
    const params = new HttpParams().set('provider', provider);
    return this.http.post<MarketplaceMappingReanalysisResult>(`${this.base}/unmapped-items/reanalyze`, {}, { params });
  }

  classifyExternalSupplier(request: MarketplaceExternalSupplierRequest): Observable<MarketplaceExternalSupplierResult> {
    return this.http.post<MarketplaceExternalSupplierResult>(`${this.base}/external-supplier`, request);
  }

  removeExternalSupplierClassification(identity: {
    provider: string;
    sellerId: string | number;
    externalItemId: string;
    externalVariationId?: string | null;
  }): Observable<MarketplaceExternalSupplierResult> {
    let params = new HttpParams()
      .set('provider', identity.provider)
      .set('sellerId', String(identity.sellerId))
      .set('externalItemId', identity.externalItemId);
    if ((identity.externalVariationId ?? '').trim()) {
      params = params.set('externalVariationId', identity.externalVariationId!.trim());
    }
    return this.http.delete<MarketplaceExternalSupplierResult>(`${this.base}/external-supplier`, { params });
  }

  deleteMapping(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getListing(id: string): Observable<MarketplaceListingWorkspace> {
    return this.http.get<MarketplaceListingWorkspace>(`${this.base}/${id}/listing`);
  }

  synchronizeListingChanges(id: string, changes: MarketplaceListingChangeSet): Observable<MarketplaceListingWorkspace> {
    return this.http.post<MarketplaceListingWorkspace>(`${this.base}/${id}/listing/changes`, changes);
  }

  saveListingChangeDraft(id: string, changes: MarketplaceListingChangeSet): Observable<MarketplaceListingChangeDraft> {
    return this.http.post<MarketplaceListingChangeDraft>(`${this.base}/${id}/listing/drafts`, changes);
  }

  applyListingChangeDraft(id: string, draftId: string): Observable<MarketplaceListingWorkspace> {
    return this.http.post<MarketplaceListingWorkspace>(`${this.base}/${id}/listing/drafts/${draftId}/apply`, {});
  }
}
