import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PlatformUserRole = 1 | 2 | 4;

export interface PlatformUserResult {
  id: string;
  name: string;
  email: string;
  role: PlatformUserRole | string;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface PlatformUserListResponse {
  items: PlatformUserResult[];
  total: number;
  skip: number;
  limit: number;
}

export interface PlatformUserCreateRequest {
  name: string;
  email: string;
  password: string;
  role: PlatformUserRole;
  isActive: boolean;
}

export interface PlatformUserUpdateRequest {
  name: string;
  email: string;
  role: PlatformUserRole;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlatformUsersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(skip = 0, limit = 50): Observable<PlatformUserListResponse> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.http.get<PlatformUserListResponse>(`${this.apiBaseUrl}/api/v1/admin/users`, { params });
  }

  get(id: string): Observable<PlatformUserResult> {
    return this.http.get<PlatformUserResult>(`${this.apiBaseUrl}/api/v1/admin/users/${id}`);
  }

  create(payload: PlatformUserCreateRequest): Observable<PlatformUserResult> {
    return this.http.post<PlatformUserResult>(`${this.apiBaseUrl}/api/v1/admin/users`, payload);
  }

  update(id: string, payload: PlatformUserUpdateRequest): Observable<PlatformUserResult> {
    return this.http.put<PlatformUserResult>(`${this.apiBaseUrl}/api/v1/admin/users/${id}`, payload);
  }

  setStatus(id: string, isActive: boolean): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.apiBaseUrl}/api/v1/admin/users/${id}/status`, { isActive });
  }

  resetPassword(id: string, temporaryPassword: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiBaseUrl}/api/v1/admin/users/${id}/reset-password`, {
      temporaryPassword
    });
  }
}
