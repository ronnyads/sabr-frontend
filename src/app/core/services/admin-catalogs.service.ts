import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface AdminCatalogResult {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  productCount: number;
  planCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCatalogDetailResult {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  productSkus: string[];
  planIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminCatalogUpsertRequest {
  name: string;
  description?: string | null;
  isActive: boolean;
}

// Alias kept for backward compat with components that still import AdminCatalogGlobalResult
export type AdminCatalogGlobalResult = AdminCatalogResult;

@Injectable({ providedIn: 'root' })
export class AdminCatalogsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(skip = 0, limit = 50, search?: string, isActive?: boolean | null): Observable<PagedResult<AdminCatalogResult>> {
    const safeSkip = Math.max(0, Math.trunc(skip));
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    let params = new HttpParams().set('skip', safeSkip).set('limit', safeLimit);
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (typeof isActive === 'boolean') {
      params = params.set('isActive', isActive);
    }

    return this.http.get<PagedResult<AdminCatalogResult>>(`${this.apiBaseUrl}/admin/catalogs`, { params });
  }

  listGlobal(skip = 0, limit = 100, search?: string, isActive?: boolean | null): Observable<PagedResult<AdminCatalogResult>> {
    return this.list(skip, limit, search, isActive);
  }

  getById(catalogId: string): Observable<AdminCatalogDetailResult> {
    return this.http.get<AdminCatalogDetailResult>(`${this.apiBaseUrl}/admin/catalogs/${catalogId}`);
  }

  create(request: AdminCatalogUpsertRequest): Observable<AdminCatalogDetailResult> {
    return this.http.post<AdminCatalogDetailResult>(`${this.apiBaseUrl}/admin/catalogs`, request);
  }

  update(catalogId: string, request: AdminCatalogUpsertRequest): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(`${this.apiBaseUrl}/admin/catalogs/${catalogId}`, request);
  }

  deactivate(catalogId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/admin/catalogs/${catalogId}`);
  }

  replaceProducts(catalogId: string, productSkus: string[]): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(`${this.apiBaseUrl}/admin/catalogs/${catalogId}/products`, { productSkus });
  }

  replacePlans(tenantSlug: string, catalogId: string, planIds: string[]): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/admin/tenants/${encodeURIComponent(tenantSlug)}/catalogs/${catalogId}/plans`,
      { planIds }
    );
  }
}
