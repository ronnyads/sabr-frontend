import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MercadoLivreIntegrationStatusResult } from './mercado-livre-integration.service';

export interface MercadoLivreCatalogImportResult {
  listingsFound: number;
  productsMatched: number;
  productsCreated: number;
  productsUpdated: number;
  productsLinkedExisting: number;
  mappingsCreated: number;
  mappingsUpdated: number;
  warnings: string[];
  items: MercadoLivreCatalogImportItem[];
}

export interface MercadoLivreCatalogImportItem {
  itemId: string;
  title: string;
  sku: string | null;
  variationId?: string | null;
  internalSku?: string | null;
  brand: string;
  thumbnailUrl: string | null;
  catalogPriceCents: number;
  action: string;
}

export interface CatalogSkuAssignment {
  itemId: string;
  variationId: string | null;
  internalSku: string;
  createNewProduct: boolean;
  catalogPriceCents?: number | null;
}

export interface MercadoLivreSellerCatalogItem {
  itemId: string;
  title: string;
  brand: string | null;
  thumbnailUrl: string | null;
  priceCents: number;
}

export interface AdminMercadoLivreMappingUpsertRequest {
  integrationId: string;
  sellerId: string;
  itemId: string;
  variationId: string | null;
  sabrVariantSku: string;
  expectedMappingVersion: number;
}

export interface AdminMercadoLivreMappingUpsertResult {
  mappingId: string;
  integrationId: string;
  sellerId: string;
  itemId: string;
  variationId: string | null;
  previousSabrVariantSku: string | null;
  sabrVariantSku: string;
  mappingVersion: number;
  action: string;
  message: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminMercadoLivreIntegrationService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getStatus(tenantSlug: string, clientId: string): Observable<MercadoLivreIntegrationStatusResult> {
    const normalizedTenantSlug = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const normalizedClientId = encodeURIComponent((clientId ?? '').trim());
    return this.http.get<MercadoLivreIntegrationStatusResult>(
      `${this.apiBaseUrl}/admin/tenants/${normalizedTenantSlug}/clients/${normalizedClientId}/integrations/mercadolivre/status`
    );
  }

  forceDisconnect(tenantSlug: string, clientId: string, sellerId?: string): Observable<void> {
    const normalizedTenantSlug = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const normalizedClientId = encodeURIComponent((clientId ?? '').trim());
    const url = `${this.apiBaseUrl}/admin/tenants/${normalizedTenantSlug}/clients/${normalizedClientId}/integrations/mercadolivre`;
    const queryParams = sellerId ? `?sellerId=${encodeURIComponent(sellerId)}` : '';
    return this.http.delete<void>(`${url}${queryParams}`);
  }

  importProducts(
    tenantSlug: string,
    clientId: string,
    previewOnly: boolean,
    itemIds: string[] = [],
    physicalStock = 1000,
    catalogPriceCents?: number | null,
    skuAssignments: CatalogSkuAssignment[] = []
  ): Observable<MercadoLivreCatalogImportResult> {
    const tenant = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const client = encodeURIComponent((clientId ?? '').trim());
    return this.http.post<MercadoLivreCatalogImportResult>(
      `${this.apiBaseUrl}/admin/tenants/${tenant}/clients/${client}/integrations/mercadolivre/catalog/import`,
      { query: '', brands: [], physicalStock, catalogPriceCents: catalogPriceCents ?? null, previewOnly, itemIds, skuAssignments }
    );
  }

  searchSellerCatalog(tenantSlug: string, clientId: string, sellerId: string, query: string): Observable<MercadoLivreSellerCatalogItem[]> {
    const tenant = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const client = encodeURIComponent((clientId ?? '').trim());
    const params = `sellerId=${encodeURIComponent(sellerId.trim())}&q=${encodeURIComponent(query.trim())}`;
    return this.http.get<MercadoLivreSellerCatalogItem[]>(
      `${this.apiBaseUrl}/admin/tenants/${tenant}/clients/${client}/integrations/mercadolivre/catalog/seller-preview?${params}`
    );
  }

  upsertMapping(
    tenantSlug: string,
    clientId: string,
    request: AdminMercadoLivreMappingUpsertRequest
  ): Observable<AdminMercadoLivreMappingUpsertResult> {
    const tenant = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const client = encodeURIComponent((clientId ?? '').trim());
    return this.http.put<AdminMercadoLivreMappingUpsertResult>(
      `${this.apiBaseUrl}/admin/tenants/${tenant}/clients/${client}/integrations/mercadolivre/mappings`,
      request
    );
  }
}
