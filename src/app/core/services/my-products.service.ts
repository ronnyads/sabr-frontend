import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from './catalog.service';
import { normalizeSkuUppercase } from '../utils/sku.utils';

export enum PricingMode {
  CatalogPrice = 0,
  MarkupPercent = 1,
  FixedPrice = 2
}

export interface AddMyProductRequest {
  productSku: string;
  pricingMode?: PricingMode;
  markupPercent?: number | null;
  fixedPriceCents?: number | null;
}

export interface UpdateMyProductDraftRequest {
  pricingMode: PricingMode;
  markupPercent?: number | null;
  fixedPriceCents?: number | null;
  rowVersion?: string | null;
}

export interface MyProductDraft {
  id: string;
  productSku: string;
  productName: string;
  thumbnailUrl?: string | null;
  status: number;
  pricingMode: PricingMode;
  markupPercent?: number | null;
  fixedPriceCents?: number | null;
  catalogPriceCentsSnapshot: number;
  finalPriceCentsSnapshot: number;
  priceSnapshotTakenAt: string;
  description?: string | null;
  images?: MyProductImageResult[];
  gtin?: string | null;
  ncm?: string | null;
  origin?: string | null;
  purchaseCost?: number | null;
  catalogPrice?: number | null;
  rowVersion: string;
  hasProductVariant?: boolean;
  variantStatus?: 'Ready' | 'Missing' | string;
  resolvedVariantSku?: string | null;
  availableStock?: number | null;
  stockSource?: 'ExactVariant' | 'AutoBestVariant' | 'FallbackZero' | string;
  createdAt: string;
  updatedAt: string;
  mlOverallStatus?: string;
  mlPublishedCount?: number;
  mlDraftCount?: number;
  mlErrorCount?: number;
}

export interface MyProductImageResult {
  url: string;
  position: number;
}

export interface ListMyProductsOptions {
  skip?: number;
  limit?: number;
  search?: string | null;
  variantSku?: string | null;
  variantSkus?: string[] | null;
}

@Injectable({ providedIn: 'root' })
export class MyProductsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;
  private readonly listCacheTtlMs = environment.dataCache?.listTtlMs ?? 30_000;
  private readonly listCache = new Map<string, { expiresAt: number; request$: Observable<PagedResult<MyProductDraft>> }>();

  constructor(private http: HttpClient) {}

  addMyProduct(request: AddMyProductRequest, idempotencyKey?: string): Observable<MyProductDraft> {
    let headers = new HttpHeaders();
    if (idempotencyKey?.trim()) {
      headers = headers.set('Idempotency-Key', idempotencyKey.trim());
    }

    const payload: AddMyProductRequest = {
      ...request,
      productSku: normalizeSkuUppercase(request.productSku)
    };

    return this.http
      .post<MyProductDraft>(`${this.apiBaseUrl}/api/v1/my-products`, payload, {
        headers,
        observe: 'response'
      })
      .pipe(
        map((response) => this.mapDraftResponse(response)),
        tap(() => this.invalidate())
      );
  }

  getMyProductById(draftId: string): Observable<MyProductDraft> {
    return this.http
      .get<MyProductDraft>(`${this.apiBaseUrl}/api/v1/my-products/${draftId}`, { observe: 'response' })
      .pipe(map((response) => this.mapDraftResponse(response)));
  }

  listMyProducts(
    skipOrOptions: number | ListMyProductsOptions = 0,
    limit = 20,
    search?: string
  ): Observable<PagedResult<MyProductDraft>> {
    const options: ListMyProductsOptions =
      typeof skipOrOptions === 'number'
        ? { skip: skipOrOptions, limit, search }
        : { ...skipOrOptions };

    const safeSkip = Math.max(0, Math.trunc(options.skip ?? 0));
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 20)));
    const normalizedSearch = (options.search ?? '').trim();
    const normalizedVariantSku = normalizeSkuUppercase(options.variantSku ?? '');
    const normalizedVariantSkus = (options.variantSkus ?? [])
      .map((item) => normalizeSkuUppercase(item))
      .filter((item, index, array) => !!item && array.indexOf(item) === index)
      .sort();
    const cacheKey = `${safeSkip}|${safeLimit}|${normalizedSearch.toLowerCase()}|${normalizedVariantSku}|${normalizedVariantSkus.join(',')}`;
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
    if (normalizedVariantSku) {
      params = params.set('variantSku', normalizedVariantSku);
    }
    for (const sku of normalizedVariantSkus) {
      params = params.append('variantSkus', sku);
    }

    const request$ = this.http
      .get<PagedResult<MyProductDraft>>(`${this.apiBaseUrl}/api/v1/my-products`, { params })
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

  updateMyProduct(
    draftId: string,
    request: UpdateMyProductDraftRequest,
    rowVersion?: string | null
  ): Observable<MyProductDraft> {
    let headers = new HttpHeaders();
    const effectiveRowVersion = (rowVersion ?? request.rowVersion ?? '').trim();
    if (effectiveRowVersion) {
      headers = headers.set('If-Match', `"${effectiveRowVersion}"`);
    }

    return this.http
      .put<MyProductDraft>(`${this.apiBaseUrl}/api/v1/my-products/${draftId}`, request, {
        headers,
        observe: 'response'
      })
      .pipe(
        map((response) => this.mapDraftResponse(response)),
        tap(() => this.invalidate())
      );
  }

  deleteMyProduct(draftId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBaseUrl}/api/v1/my-products/${draftId}`).pipe(
      tap(() => this.invalidate())
    );
  }

  invalidate(): void {
    this.listCache.clear();
  }

  private mapDraftResponse(response: HttpResponse<MyProductDraft>): MyProductDraft {
    const draft = response.body;
    if (!draft) {
      throw new Error('Resposta de draft vazia');
    }

    const etag = this.normalizeEtag(response.headers.get('ETag'));
    if (etag) {
      draft.rowVersion = etag;
    }

    return draft;
  }

  private normalizeEtag(raw: string | null): string | null {
    if (!raw) {
      return null;
    }

    let normalized = raw.trim();
    if (normalized.startsWith('W/', 0)) {
      normalized = normalized.substring(2).trim();
    }

    normalized = normalized.replace(/^"+|"+$/g, '');
    return normalized || null;
  }
}
