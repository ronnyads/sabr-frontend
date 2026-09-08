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
  mappingsCreated: number;
  warnings: string[];
  items: MercadoLivreCatalogImportItem[];
}

export interface MercadoLivreCatalogImportItem {
  itemId: string;
  title: string;
  sku: string | null;
  brand: string;
  thumbnailUrl: string | null;
  catalogPriceCents: number;
  action: string;
}

export interface MercadoLivreSellerCatalogItem {
  itemId: string;
  title: string;
  brand: string | null;
  thumbnailUrl: string | null;
  priceCents: number;
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

  importProducts(tenantSlug: string, clientId: string, previewOnly: boolean, itemIds: string[] = []): Observable<MercadoLivreCatalogImportResult> {
    const tenant = encodeURIComponent((tenantSlug ?? '').trim().toLowerCase());
    const client = encodeURIComponent((clientId ?? '').trim());
    return this.http.post<MercadoLivreCatalogImportResult>(
      `${this.apiBaseUrl}/admin/tenants/${tenant}/clients/${client}/integrations/mercadolivre/catalog/import`,
      { query: '', brands: [], physicalStock: 1000, previewOnly, itemIds }
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
}
