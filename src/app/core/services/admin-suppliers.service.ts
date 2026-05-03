import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SupplierResult {
  id: string;
  name: string;
  email: string;
  companyName?: string | null;
  phone?: string | null;
  document?: string | null;
  status: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface AdminCreateSupplierRequest {
  name: string;
  email: string;
  password: string;
  companyName?: string;
  document?: string;
  phone?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminSuppliersService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(): Observable<SupplierResult[]> {
    return this.http.get<SupplierResult[]>(`${this.apiBaseUrl}/admin/suppliers`);
  }

  create(payload: AdminCreateSupplierRequest): Observable<SupplierResult> {
    return this.http.post<SupplierResult>(`${this.apiBaseUrl}/admin/suppliers`, payload);
  }

  activate(id: string): Observable<SupplierResult> {
    return this.http.post<SupplierResult>(`${this.apiBaseUrl}/admin/suppliers/${id}/activate`, {});
  }

  suspend(id: string): Observable<SupplierResult> {
    return this.http.post<SupplierResult>(`${this.apiBaseUrl}/admin/suppliers/${id}/suspend`, {});
  }
}
