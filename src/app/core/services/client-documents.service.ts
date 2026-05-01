import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ClientDocumentUploadResponse {
  documentId: string;
  status: number;
}

export interface ClientDocumentResult {
  id: string;
  documentType: number;
  status: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  fileUrl: string;
  submittedAt: string;
  requestedAt?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  reviewReason?: string | null;
}

export interface ClientDocumentListResponse {
  items: ClientDocumentResult[];
  total: number;
  skip: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class ClientDocumentsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(clientId: string, skip = 0, limit = 200): Observable<ClientDocumentListResponse> {
    const params = new HttpParams().set('skip', skip).set('limit', limit);
    return this.http.get<ClientDocumentListResponse>(
      `${this.apiBaseUrl}/client-documents/${clientId}`,
      { params }
    );
  }

  get(clientId: string, documentId: string): Observable<ClientDocumentResult> {
    return this.http.get<ClientDocumentResult>(
      `${this.apiBaseUrl}/client-documents/${clientId}/${documentId}`
    );
  }

  download(clientId: string, documentId: string): Observable<Blob> {
    return this.http.get(
      `${this.apiBaseUrl}/client-documents/${clientId}/${documentId}/download`,
      { responseType: 'blob' }
    );
  }

  upload(clientId: string, documentType: number, file: File): Observable<ClientDocumentUploadResponse> {
    const formData = new FormData();
    formData.append('documentType', String(documentType));
    formData.append('file', file);

    return this.http.post<ClientDocumentUploadResponse>(
      `${this.apiBaseUrl}/client-documents/${clientId}`,
      formData
    );
  }

  requestReview(clientId: string, documentId: string): Observable<{ documentId: string; status: number }> {
    return this.http.post<{ documentId: string; status: number }>(
      `${this.apiBaseUrl}/client-documents/${clientId}/${documentId}/request`,
      {}
    );
  }

  approve(clientId: string, documentId: string, reviewedByUserId?: string): Observable<{ documentId: string; status: number }> {
    return this.http.post<{ documentId: string; status: number }>(
      `${this.apiBaseUrl}/client-documents/${clientId}/${documentId}/approve`,
      {
        reviewedByUserId: reviewedByUserId ?? null
      }
    );
  }

  reject(clientId: string, documentId: string, reason: string, reviewedByUserId?: string): Observable<{ documentId: string; status: number }> {
    return this.http.post<{ documentId: string; status: number }>(
      `${this.apiBaseUrl}/client-documents/${clientId}/${documentId}/reject`,
      {
        reviewedByUserId: reviewedByUserId ?? null,
        reason
      }
    );
  }
}
