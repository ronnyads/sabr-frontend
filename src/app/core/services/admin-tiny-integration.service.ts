import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TinyIntegrationStatus, TinySyncResult } from './tiny-integration.service';

export interface TinyCatalogSyncResult {
  linked: number;
  unlinked: number;
  skipped: number;
}

export interface TinyInvoiceResult {
  noteId: number;
  numero?: string;
  chaveAcesso?: string;
  xmlUrl?: string;
  danfeUrl?: string;
  situacao: string;
}

@Injectable({ providedIn: 'root' })
export class AdminTinyIntegrationService {
  private base(clientId: string) {
    return `${environment.apiBaseUrl}/admin/clients/${clientId}/integrations/tinyerp`;
  }

  constructor(private http: HttpClient) {}

  getStatus(clientId: string): Observable<TinyIntegrationStatus> {
    return this.http.get<TinyIntegrationStatus>(`${this.base(clientId)}/status`);
  }

  syncOrders(clientId: string): Observable<TinySyncResult> {
    return this.http.post<TinySyncResult>(`${this.base(clientId)}/sync-orders`, {});
  }

  syncCatalog(clientId: string): Observable<TinyCatalogSyncResult> {
    return this.http.post<TinyCatalogSyncResult>(`${this.base(clientId)}/sync-catalog`, {});
  }

  generateInvoice(clientId: string, orderId: string): Observable<TinyInvoiceResult> {
    return this.http.post<TinyInvoiceResult>(`${this.base(clientId)}/orders/${orderId}/generate-invoice`, {});
  }

  getInvoiceXml(clientId: string, orderId: string): Observable<Blob> {
    return this.http.get(`${this.base(clientId)}/orders/${orderId}/invoice-xml`, { responseType: 'blob' });
  }

  getInvoiceLink(clientId: string, orderId: string): Observable<TinyInvoiceResult> {
    return this.http.get<TinyInvoiceResult>(`${this.base(clientId)}/orders/${orderId}/invoice-link`);
  }
}
