import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SupplierProductResult {
  id: string;
  supplierId: string;
  name: string;
  description: string;
  brand: string;
  ncm?: string | null;
  ean?: string | null;
  costPriceCents: number;
  platformMarginPercent: number;
  status: string;
  adminNotes?: string | null;
  linkedProductSku?: string | null;
  images?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  lengthCm?: number | null;
  weightKg?: number | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
}

export interface SupplierProductUpsertRequest {
  name: string;
  description?: string | null;
  brand?: string | null;
  ncm?: string | null;
  ean?: string | null;
  costPriceCents: number;
  images?: string | null;
  widthCm?: number | null;
  heightCm?: number | null;
  lengthCm?: number | null;
  weightKg?: number | null;
}

@Injectable({ providedIn: 'root' })
export class SupplierProductsService {
  private readonly base = `${environment.apiBaseUrl}/supplier/products`;

  constructor(private http: HttpClient) {}

  list(): Observable<SupplierProductResult[]> {
    return this.http.get<SupplierProductResult[]>(this.base);
  }

  get(id: string): Observable<SupplierProductResult> {
    return this.http.get<SupplierProductResult>(`${this.base}/${id}`);
  }

  create(request: SupplierProductUpsertRequest): Observable<SupplierProductResult> {
    return this.http.post<SupplierProductResult>(this.base, request);
  }

  update(id: string, request: SupplierProductUpsertRequest): Observable<SupplierProductResult> {
    return this.http.put<SupplierProductResult>(`${this.base}/${id}`, request);
  }

  submit(id: string): Observable<SupplierProductResult> {
    return this.http.post<SupplierProductResult>(`${this.base}/${id}/submit`, {});
  }

  delete(id: string): Observable<boolean> {
    return this.http.delete<boolean>(`${this.base}/${id}`);
  }
}
