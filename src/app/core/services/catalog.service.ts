import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PagedResult<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface CatalogProduct {
  sku: string;
  name: string;
  thumbnailUrl?: string | null;
  catalogPriceCents: number;
  isActive: boolean;
}

export interface CatalogVariant {
  variantSku: string;
  baseSku: string;
  productName: string;
  variantName: string;
  availableStock: number;
  thumbnailUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly apiBaseUrl = environment.apiBaseUrl;
  private readonly listCacheTtlMs = environment.dataCache?.listTtlMs ?? 30_000;
  private readonly listCache = new Map<string, { expiresAt: number; request$: Observable<PagedResult<CatalogProduct>> }>();

  constructor(private http: HttpClient) {}

  listCatalogProducts(skip = 0, limit = 20, search?: string): Observable<PagedResult<CatalogProduct>> {
    const safeSkip = Math.max(0, Math.trunc(skip));
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    const normalizedSearch = (search ?? '').trim();
    const cacheKey = `${safeSkip}|${safeLimit}|${normalizedSearch.toLowerCase()}`;
    const cached = this.listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.request$;
    }
    if (cached) {
      this.listCache.delete(cacheKey);
    }

    let params = new HttpParams().set('skip', safeSkip).set('limit', safeLimit);
    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }

    const request$ = this.http
      .get<PagedResult<CatalogProduct>>(`${this.apiBaseUrl}/catalog/products`, { params })
      .pipe(
        catchError((error) => {
          this.listCache.delete(cacheKey);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );

    this.listCache.set(cacheKey, {
      expiresAt: Date.now() + this.listCacheTtlMs,
      request$
    });
    return request$;
  }

  listCatalogVariants(skip = 0, limit = 200, search?: string, productSku?: string): Observable<PagedResult<CatalogVariant>> {
    let params = new HttpParams()
      .set('skip', Math.max(0, Math.trunc(skip)))
      .set('limit', Math.min(200, Math.max(1, Math.trunc(limit))));

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      params = params.set('search', normalizedSearch);
    }

    const normalizedProductSku = (productSku ?? '').trim();
    if (normalizedProductSku) {
      params = params.set('productSku', normalizedProductSku);
    }

    return this.http.get<PagedResult<CatalogVariant>>(`${this.apiBaseUrl}/client/catalog/variants`, { params });
  }

  invalidate(): void {
    this.listCache.clear();
  }
}
