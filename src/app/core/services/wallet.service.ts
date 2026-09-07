import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WalletDeposit {
  id: string; tenantId: string; clientId: string; clientName: string;
  amountCents: number; method: string; status: string; proofFileName: string;
  clientNote?: string | null; reviewNote?: string | null; createdAt: string;
  reviewedAt?: string | null; ledgerEntryId?: string | null;
}
export interface WalletLedgerItem { id: string; type: string; amountCents: number; balanceAfterCents: number; referenceType?: string; referenceId?: string; createdAt: string; }
export interface ClientWallet { balanceCents: number; pendingDepositCents: number; deposits: WalletDeposit[]; ledger: WalletLedgerItem[]; }

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly clientUrl = `${environment.apiBaseUrl}/client/wallet`;
  private readonly adminUrl = `${environment.apiBaseUrl}/admin/wallet/deposits`;
  constructor(private readonly http: HttpClient) {}
  getClientWallet(): Observable<ClientWallet> { return this.http.get<ClientWallet>(this.clientUrl); }
  createDeposit(amountCents: number, proof: File, clientNote: string): Observable<WalletDeposit> {
    const form = new FormData(); form.append('amountCents', String(amountCents)); form.append('proof', proof);
    if (clientNote.trim()) form.append('clientNote', clientNote.trim());
    return this.http.post<WalletDeposit>(`${this.clientUrl}/deposits`, form);
  }
  getClientProof(id: string): Observable<Blob> { return this.http.get(`${this.clientUrl}/deposits/${id}/proof`, { responseType: 'blob' }); }
  listDeposits(status = 'Pending'): Observable<WalletDeposit[]> { return this.http.get<WalletDeposit[]>(this.adminUrl, { params: new HttpParams().set('status', status) }); }
  reviewDeposit(id: string, action: 'approve' | 'reject', note: string): Observable<WalletDeposit> { return this.http.post<WalletDeposit>(`${this.adminUrl}/${id}/${action}`, { note }); }
  getAdminProof(id: string): Observable<Blob> { return this.http.get(`${this.adminUrl}/${id}/proof`, { responseType: 'blob' }); }
}
