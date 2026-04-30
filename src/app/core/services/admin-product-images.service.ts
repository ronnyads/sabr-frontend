import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminProductImageResult } from './admin-products.service';

@Injectable({ providedIn: 'root' })
export class AdminProductImagesService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  upload(sku: string, file: File): Observable<AdminProductImageResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post<AdminProductImageResult>(
      `${this.apiBaseUrl}/admin/products/${encodeURIComponent(sku)}/images`,
      formData
    );
  }

  delete(sku: string, imageId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.apiBaseUrl}/admin/products/${encodeURIComponent(sku)}/images/${encodeURIComponent(imageId)}`
    );
  }

  setPrimary(sku: string, imageId: string): Observable<AdminProductImageResult> {
    return this.http.put<AdminProductImageResult>(
      `${this.apiBaseUrl}/admin/products/${encodeURIComponent(sku)}/images/${encodeURIComponent(imageId)}/primary`,
      {}
    );
  }
}
