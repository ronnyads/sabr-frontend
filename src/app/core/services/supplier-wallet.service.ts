import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SupplierWalletSummary {
  supplierId: string;
  pendingBalanceCents: number;
  blockedBalanceCents: number;
  availableBalanceCents: number;
  totalBalanceCents: number;
  updatedAt: string;
}

export interface SupplierWalletEntry {
  id: string;
  supplierId: string;
  orderId?: string | null;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  status: string;
  referenceType?: string | null;
  referenceId?: string | null;
  scheduledAvailableAt?: string | null;
  createdAt: string;
}

export interface SupplierWalletEntriesResult {
  items: SupplierWalletEntry[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class SupplierWalletService {
  private readonly base = `${environment.apiBaseUrl}/supplier/wallet`;

  constructor(private http: HttpClient) {}

  getSummary(): Observable<SupplierWalletSummary> {
    return this.http.get<SupplierWalletSummary>(this.base);
  }

  getEntries(page = 1, pageSize = 20): Observable<SupplierWalletEntriesResult> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<SupplierWalletEntriesResult>(`${this.base}/entries`, { params });
  }
}
