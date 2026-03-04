import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface AdminProductImageResult {
  id: string;
  productSku: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface AdminProductResult {
  sku: string;
  name: string;
  brand: string;
  ncm?: string | null;
  ean?: string | null;
  description?: string | null;
  categoryId?: string | null;
  thumbnailUrl?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  lengthCm?: number | null;
  weightKg?: number | null;
  requiresAnatel: boolean;
  anatelHomologationNumber?: string | null;
  anatelDocumentId?: string | null;
  costPriceCents: number;
  catalogPriceCents: number;
  isActive: boolean;
  images: AdminProductImageResult[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductUpsertRequest {
  sku: string;
  name: string;
  brand: string;
  ncm?: string | null;
  ean?: string | null;
  description?: string | null;
  categoryId?: string | null;
  thumbnailUrl?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  lengthCm?: number | null;
  weightKg?: number | null;
  requiresAnatel: boolean;
  anatelHomologationNumber?: string | null;
  anatelDocumentId?: string | null;
  tenantSlug?: string | null;
  costPriceCents: number;
  catalogPriceCents: number;
  isActive: boolean;
}

export interface AdminProductUpdateRequest {
  name?: string | null;
  brand?: string | null;
  ncm?: string | null;
  ean?: string | null;
  description?: string | null;
  categoryId?: string | null;
  thumbnailUrl?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  lengthCm?: number | null;
  weightKg?: number | null;
  requiresAnatel?: boolean | null;
  anatelHomologationNumber?: string | null;
  anatelDocumentId?: string | null;
  tenantSlug?: string | null;
  costPriceCents?: number | null;
  catalogPriceCents?: number | null;
  isActive?: boolean | null;
  reason?: string | null;
}

export interface ProductCatalogLinksResult {
  productSku: string;
  catalogIds: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminProductsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(skip = 0, limit = 20, search?: string, isActive?: boolean | null): Observable<PagedResult<AdminProductResult>> {
    let params = new HttpParams().set('skip', skip).set('limit', limit);
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (typeof isActive === 'boolean') {
      params = params.set('isActive', isActive);
    }

    return this.http.get<PagedResult<AdminProductResult>>(`${this.apiBaseUrl}/api/v1/admin/products`, { params });
  }

  getBySku(sku: string): Observable<AdminProductResult> {
    return this.http.get<AdminProductResult>(`${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}`);
  }

  create(request: AdminProductUpsertRequest): Observable<AdminProductResult> {
    return this.http.post<AdminProductResult>(`${this.apiBaseUrl}/api/v1/admin/products`, request);
  }

  update(sku: string, request: AdminProductUpdateRequest): Observable<AdminProductResult> {
    return this.http.put<AdminProductResult>(
      `${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}`,
      request
    );
  }

  deactivate(sku: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}`);
  }

  getCatalogLinks(tenantSlug: string, sku: string): Observable<ProductCatalogLinksResult> {
    return this.http.get<ProductCatalogLinksResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/products/${encodeURIComponent(sku)}/catalogs`
    );
  }

  replaceCatalogLinks(tenantSlug: string, sku: string, catalogIds: string[]): Observable<AdminProductResult> {
    return this.http.put<AdminProductResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantSlug)}/products/${encodeURIComponent(sku)}/catalogs`,
      { catalogIds }
    );
  }
}
