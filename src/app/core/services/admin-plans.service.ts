import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export type BillingPeriod = 'Monthly' | 'Quarterly' | 'Semiannual' | 'Annual';

export interface AdminPlanResult {
  id: string;
  name: string;
  billingPeriod: BillingPeriod;
  isActive: boolean;
  catalogCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPlanDetailResult {
  id: string;
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
      `${this.apiBaseUrl}/admin/plans`,
      { params }
    );
  }

  getById(planId: string): Observable<AdminPlanDetailResult> {
    return this.http.get<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/admin/plans/${planId}`
    );
  }

  create(request: AdminPlanUpsertRequest): Observable<AdminPlanDetailResult> {
    return this.http.post<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/admin/plans`,
      request
    );
  }

  update(planId: string, request: AdminPlanUpsertRequest): Observable<AdminPlanDetailResult> {
    return this.http.put<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/admin/plans/${planId}`,
      request
    );
  }

  deactivate(planId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/admin/plans/${planId}`
    );
  }

  replaceCatalogs(planId: string, catalogIds: string[]): Observable<AdminPlanDetailResult> {
    return this.http.put<AdminPlanDetailResult>(
      `${this.apiBaseUrl}/admin/plans/${planId}/catalogs`,
      { catalogIds }
    );
  }
}
