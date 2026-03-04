import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CatalogVariantSnapshotRequest {
  variantSku: string;
}

export interface CatalogVariantSnapshotImage {
  url: string;
  position: number;
}

export interface CatalogVariantSnapshotDimensions {
  weightKg?: number | null;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
}

export interface CatalogVariantSnapshotIssue {
  code: string;
  fieldPath: string;
  severity: 'warning' | 'error' | string;
  message: string;
}

export interface CatalogVariantSnapshotResult {
  variantSku: string;
  baseSku: string;
  title: string;
  description?: string | null;
  costPrice: number;
  catalogPrice?: number | null;
  currencyId: string;
  stockAvailable: number;
  resolvedVariantSku?: string | null;
  stockSource?: 'ExactVariant' | 'AutoBestVariant' | 'FallbackZero' | string;
  gtin?: string | null;
  ncm?: string | null;
  origin?: string | null;
  brand?: string | null;
  listingTypeDefault: string;
  siteId: string;
  images: CatalogVariantSnapshotImage[];
  dimensions: CatalogVariantSnapshotDimensions;
  variantBackfilled: boolean;
  qualityIssues: CatalogVariantSnapshotIssue[];
}

@Injectable({ providedIn: 'root' })
export class CatalogSnapshotService {
  private readonly apiBaseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  getVariantSnapshot(request: CatalogVariantSnapshotRequest): Observable<CatalogVariantSnapshotResult> {
    return this.http.post<CatalogVariantSnapshotResult>(`${this.apiBaseUrl}/api/v1/client/catalog/variants/snapshot`, request);
  }
}
