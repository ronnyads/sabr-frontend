import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SupplierWithdrawalResult {
  id: string;
  supplierId: string;
  requestedAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
  status: string;
  bankDetailsSnapshot?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
}

export interface SupplierWithdrawalsResult {
  items: SupplierWithdrawalResult[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class SupplierWithdrawalsService {
  private readonly base = `${environment.apiBaseUrl}/supplier/withdrawals`;

  constructor(private http: HttpClient) {}

  list(page = 1, pageSize = 20): Observable<SupplierWithdrawalsResult> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<SupplierWithdrawalsResult>(this.base, { params });
  }

  get(id: string): Observable<SupplierWithdrawalResult> {
    return this.http.get<SupplierWithdrawalResult>(`${this.base}/${id}`);
  }

  request(requestedAmountCents: number): Observable<SupplierWithdrawalResult> {
    return this.http.post<SupplierWithdrawalResult>(this.base, { requestedAmountCents });
  }
}
