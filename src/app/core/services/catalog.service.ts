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
  availableStock: number;
  isActive: boolean;
  brand: string;
  categoryId?: string | null;
  categoryName?: string | null;
  variantCount: number;
  createdAt: string;
  isAddedToMyProducts: boolean;
}

export interface CatalogFacetOption { value: string; label: string; count: number; }
export interface CatalogProductFacets {
  categories: CatalogFacetOption[];
  brands: CatalogFacetOption[];
  inStockCount: number;
  outOfStockCount: number;
  addedCount: number;
  notAddedCount: number;
}
export interface CatalogProductPage extends PagedResult<CatalogProduct> { facets: CatalogProductFacets; }
export interface CatalogProductImage { url: string; position: number; isPrimary: boolean; }
export interface CatalogProductDetailVariant { sku: string; name: string; availableStock: number; catalogPriceCents: number; }
export interface CatalogProductDetail {
  sku: string; name: string; brand: string; description?: string | null;
  categoryId?: string | null; categoryName?: string | null; ncm?: string | null; ean?: string | null;
  catalogPriceCents: number; availableStock: number; isAddedToMyProducts: boolean;
  widthCm?: number | null; heightCm?: number | null; lengthCm?: number | null; weightKg?: number | null;
  requiresAnatel: boolean; anatelHomologationNumber?: string | null;
  images: CatalogProductImage[]; variants: CatalogProductDetailVariant[];
}
export interface CatalogListOptions {
  skip?: number; limit?: number; search?: string; categoryId?: string; brand?: string;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK';
  membership?: 'ALL' | 'ADDED' | 'NOT_ADDED';
  sort?: 'RELEVANCE' | 'NEWEST' | 'NAME' | 'PRICE' | 'STOCK'; direction?: 'ASC' | 'DESC';
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
  private readonly listCache = new Map<string, { expiresAt: number; request$: Observable<CatalogProductPage> }>();

  constructor(private http: HttpClient) {}

  listCatalogProducts(skipOrOptions: number | CatalogListOptions = 0, limit = 20, search?: string): Observable<CatalogProductPage> {
    const options: CatalogListOptions = typeof skipOrOptions === 'number'
      ? { skip: skipOrOptions, limit, search }
      : { ...skipOrOptions };
    const safeSkip = Math.max(0, Math.trunc(options.skip ?? 0));
    const safeLimit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 20)));
    const normalizedSearch = (options.search ?? '').trim();
    const cacheKey = JSON.stringify({ ...options, skip: safeSkip, limit: safeLimit, search: normalizedSearch.toLowerCase() });
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
    if (options.categoryId) params = params.set('categoryId', options.categoryId);
    if (options.brand) params = params.set('brand', options.brand);
    params = params
      .set('stockStatus', options.stockStatus ?? 'ALL')
      .set('membership', options.membership ?? 'ALL')
      .set('sort', options.sort ?? 'NAME')
      .set('direction', options.direction ?? 'ASC');

    const request$ = this.http
      .get<CatalogProductPage>(`${this.apiBaseUrl}/catalog/products`, { params })
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

  getCatalogProduct(sku: string): Observable<CatalogProductDetail> {
    return this.http.get<CatalogProductDetail>(`${this.apiBaseUrl}/catalog/products/${encodeURIComponent(sku)}`);
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
