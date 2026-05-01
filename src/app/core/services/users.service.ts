import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserResult {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  sectorCode?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface UserListResponse {
  items: UserResult[];
  total: number;
  skip: number;
  limit: number;
}

export interface UserCreateRequest {
  name: string;
  email: string;
  password: string;
  role: number;
  sectorCode?: string | null;
  isActive?: boolean;
}

export interface UserUpdateRequest {
  name: string;
  email: string;
  password?: string | null;
  role: number;
  sectorCode?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(tenantId: string, skip = 0, limit = 50): Observable<UserListResponse> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.http.get<UserListResponse>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/users`,
      { params }
    );
  }

  create(tenantId: string, payload: UserCreateRequest): Observable<UserResult> {
    return this.http.post<UserResult>(`${this.apiBaseUrl}/admin/tenants/${tenantId}/users`, payload);
  }

  update(tenantId: string, userId: string, payload: UserUpdateRequest): Observable<UserResult> {
    return this.http.put<UserResult>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/users/${userId}`,
      payload
    );
  }

  deactivate(tenantId: string, userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/users/${userId}`
    );
  }
}
