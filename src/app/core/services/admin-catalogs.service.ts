import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface AdminCatalogResult {
  id: string;
  tenantId: string;
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
  tenantId: string;
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

@Injectable({ providedIn: 'root' })
export class AdminCatalogsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(
    tenantId: string,
    skip = 0,
    limit = 20,
    search?: string,
    isActive?: boolean | null
  ): Observable<PagedResult<AdminCatalogResult>> {
    const safeSkip = Math.max(0, Math.trunc(skip));
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    let params = new HttpParams().set('skip', safeSkip).set('limit', safeLimit);
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (typeof isActive === 'boolean') {
      params = params.set('isActive', isActive);
    }

    return this.http.get<PagedResult<AdminCatalogResult>>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs`,
      { params }
    );
  }

  getById(tenantId: string, catalogId: string): Observable<AdminCatalogDetailResult> {
    return this.http.get<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs/${catalogId}`
    );
  }

  create(tenantId: string, request: AdminCatalogUpsertRequest): Observable<AdminCatalogDetailResult> {
    return this.http.post<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs`,
      request
    );
  }

  update(tenantId: string, catalogId: string, request: AdminCatalogUpsertRequest): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs/${catalogId}`,
      request
    );
  }

  deactivate(tenantId: string, catalogId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs/${catalogId}`
    );
  }

  replaceProducts(tenantId: string, catalogId: string, productSkus: string[]): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs/${catalogId}/products`,
      { productSkus }
    );
  }

  replacePlans(tenantId: string, catalogId: string, planIds: string[]): Observable<AdminCatalogDetailResult> {
    return this.http.put<AdminCatalogDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/catalogs/${catalogId}/plans`,
      { planIds }
    );
  }
}
