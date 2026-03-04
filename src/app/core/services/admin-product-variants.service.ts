import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminProductVariantResult {
  variantSku: string;
  baseSku: string;
  name: string;
  costPriceCents: number;
  catalogPriceCents: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductVariantCreateRequest {
  variantSku: string;
  name?: string | null;
  costPriceCents?: number | null;
  catalogPriceCents?: number | null;
  physicalStock?: number | null;
  reservedStock?: number | null;
  isActive?: boolean | null;
}

export interface AdminProductVariantUpdateRequest {
  name?: string | null;
  costPriceCents?: number | null;
  catalogPriceCents?: number | null;
  physicalStock?: number | null;
  reservedStock?: number | null;
  isActive?: boolean | null;
}

@Injectable({ providedIn: 'root' })
export class AdminProductVariantsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  list(sku: string): Observable<AdminProductVariantResult[]> {
    return this.http.get<AdminProductVariantResult[]>(
      `${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}/variants`
    );
  }

  create(sku: string, request: AdminProductVariantCreateRequest): Observable<AdminProductVariantResult> {
    return this.http.post<AdminProductVariantResult>(
      `${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}/variants`,
      request
    );
  }

  update(sku: string, variantSku: string, request: AdminProductVariantUpdateRequest): Observable<AdminProductVariantResult> {
    return this.http.put<AdminProductVariantResult>(
      `${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}/variants/${encodeURIComponent(variantSku)}`,
      request
    );
  }

  deactivate(sku: string, variantSku: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/api/v1/admin/products/${encodeURIComponent(sku)}/variants/${encodeURIComponent(variantSku)}`
    );
  }
}
