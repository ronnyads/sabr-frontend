import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export type BillingPeriod = 'Monthly' | 'Quarterly' | 'Semiannual' | 'Annual';

export interface AdminPlanResult {
  id: string;
  tenantId: string;
  name: string;
  billingPeriod: BillingPeriod;
  isActive: boolean;
  catalogCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlanDetailResult {
  id: string;
  tenantId: string;
  name: string;
  billingPeriod: BillingPeriod;
  isActive: boolean;
  catalogIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlanUpsertRequest {
  name: string;
  billingPeriod: BillingPeriod;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminPlansService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(
    tenantId: string,
    skip = 0,
    limit = 20,
    search?: string,
    isActive?: boolean | null
  ): Observable<PagedResult<AdminPlanResult>> {
    let params = new HttpParams().set('skip', skip).set('limit', limit);
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (typeof isActive === 'boolean') {
      params = params.set('isActive', isActive);
    }

    return this.http.get<PagedResult<AdminPlanResult>>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans`,
      { params }
    );
  }

  getById(tenantId: string, planId: string): Observable<AdminPlanDetailResult> {
    return this.http.get<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans/${planId}`
    );
  }

  create(tenantId: string, request: AdminPlanUpsertRequest): Observable<AdminPlanDetailResult> {
    return this.http.post<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans`,
      request
    );
  }

  update(tenantId: string, planId: string, request: AdminPlanUpsertRequest): Observable<AdminPlanDetailResult> {
    return this.http.put<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans/${planId}`,
      request
    );
  }

  deactivate(tenantId: string, planId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans/${planId}`
    );
  }

  replaceCatalogs(tenantId: string, planId: string, catalogIds: string[]): Observable<AdminPlanDetailResult> {
    return this.http.put<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/plans/${planId}/catalogs`,
      { catalogIds }
    );
  }
}
