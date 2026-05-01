import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';

export interface AdminCategoryResult {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentSlug?: string | null;
  icon?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryDetailResult {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentSlug?: string | null;
  icon?: string | null;
  description?: string | null;
  isActive: boolean;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  isActive: boolean;
  path: string;
  children: AdminCategoryTreeNode[];
}

export interface AdminCategoryUpsertRequest {
  name: string;
  slug: string;
  parentId?: string | null;
  icon?: string | null;
  description?: string | null;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminCategoriesService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  list(skip = 0, limit = 20, search?: string, isActive?: boolean | null): Observable<PagedResult<AdminCategoryResult>> {
    let params = new HttpParams().set('skip', skip).set('limit', limit);
    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (typeof isActive === 'boolean') {
      params = params.set('isActive', isActive);
    }

    return this.http.get<PagedResult<AdminCategoryResult>>(`${this.apiBaseUrl}/admin/categories`, { params });
  }

  tree(): Observable<AdminCategoryTreeNode[]> {
    return this.http.get<AdminCategoryTreeNode[]>(`${this.apiBaseUrl}/admin/categories/tree`);
  }

  getById(categoryId: string): Observable<AdminCategoryDetailResult> {
    return this.http.get<AdminCategoryDetailResult>(`${this.apiBaseUrl}/admin/categories/${encodeURIComponent(categoryId)}`);
  }

  create(request: AdminCategoryUpsertRequest): Observable<AdminCategoryDetailResult> {
    return this.http.post<AdminCategoryDetailResult>(`${this.apiBaseUrl}/admin/categories`, request);
  }

  update(categoryId: string, request: AdminCategoryUpsertRequest): Observable<AdminCategoryDetailResult> {
    return this.http.put<AdminCategoryDetailResult>(`${this.apiBaseUrl}/admin/categories/${encodeURIComponent(categoryId)}`, request);
  }

  deactivate(categoryId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/admin/categories/${encodeURIComponent(categoryId)}`);
  }
}
