import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientResult {
  id: string;
  tenantId: string;
  tenantSlug?: string | null;
  protheusCode: string;
  accountName: string;
  email: string;
  status: number;
  mustChangePassword?: boolean | null;
  profileCompletedAt?: string | null;
}

export interface ClientListResponse {
  items: ClientResult[];
  total: number;
  skip: number;
  limit: number;
}

export interface ClientSeedRequest {
  accountName: string;
  email: string;
  temporaryPassword: string;
}

export interface ClientSeedResult {
  clientId: string;
  tenantId: string;
  protheusCode: string;
  accountName: string;
  email: string;
  status: number;
}

export interface ClientApprovalResult {
  clientId: string;
  status: number;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(skip = 0, limit = 50, status?: string, search?: string): Observable<ClientListResponse> {
    let params = new HttpParams().set('skip', skip).set('limit', limit);
    if (status) params = params.set('status', status);
    if (search) params = params.set('search', search);
    // Platform list of tenants (current model is 1 client per tenant).
    return this.http.get<ClientListResponse>(`${this.apiBaseUrl}/admin/tenants`, { params });
  }

  create(payload: ClientSeedRequest): Observable<ClientSeedResult> {
    // Create tenant + initial client seed.
    return this.http.post<ClientSeedResult>(`${this.apiBaseUrl}/admin/tenants`, payload);
  }

  approve(tenantId: string, clientId: string): Observable<ClientApprovalResult> {
    return this.http.post<ClientApprovalResult>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/clients/${clientId}/approve`,
      {}
    );
  }

  reject(tenantId: string, clientId: string, reason: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/clients/${clientId}/reject`,
      { reason }
    );
  }

  deactivate(tenantId: string, clientId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/clients/${clientId}`
    );
  }

  resetPassword(tenantId: string, clientId: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(
      `${this.apiBaseUrl}/admin/tenants/${tenantId}/clients/${clientId}/reset-password`,
      {}
    );
  }
}
