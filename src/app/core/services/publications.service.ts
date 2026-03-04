import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ListingDraftImageRequest {
  url: string;
  position: number;
}

export interface ListingDraftAttributeRequest {
  id: string;
  valueId?: string | null;
  valueName?: string | null;
}

export interface ListingDraftVariationAttributeRequest {
  id: string;
  valueId?: string | null;
  valueName?: string | null;
}

export interface ListingDraftVariationRequest {
  sabrVariantSku: string;
  price?: number | null;
  initialQuantity?: number | null;
  attributes: ListingDraftVariationAttributeRequest[];
  pictureIds: string[];
}

export interface ListingDraftUpsertRequest {
  draftId?: string | null;
  integrationId?: string | null;
  channel?: string | null;
  sellerId?: string | null;
  siteId?: string | null;
  sabrVariantSku?: string | null;
  categoryId?: string | null;
  listingTypeId?: string | null;
  condition?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currencyId?: string | null;
  gtin?: string | null;
  emptyGtinReason?: string | null;
  ncm?: string | null;
  origin?: string | null;
  images?: ListingDraftImageRequest[] | null;
  attributes?: ListingDraftAttributeRequest[] | null;
  productCost?: number | null;
  operationalCost?: number | null;
  publishMode?: string | null;
  selectedVariantSkus?: string[] | null;
  variationAxes?: string[] | null;
  variations?: ListingDraftVariationRequest[] | null;
  clearFields?: string[] | null;
}

export interface ListingDraftResult {
  draftId: string;
  integrationId: string;
  channel: string;
  sellerId: string;
  siteId?: string | null;
  baseProductSku: string;
  sabrVariantSku: string;
  categoryId?: string | null;
  listingTypeId?: string | null;
  condition?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currencyId: string;
  gtin?: string | null;
  emptyGtinReason?: string | null;
  ncm?: string | null;
  origin?: string | null;
  images: ListingDraftImageRequest[];
  attributes: ListingDraftAttributeRequest[];
  status: string;
  rowVersion: string;
  updatedAt: string;
  warnings: string[];
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastErrorAt?: string | null;
  publishedItemId?: string | null;
  publishedVariationId?: string | null;
  publishedPermalink?: string | null;
  publishedApiUrl?: string | null;
}

export interface ListingDraftGetRequest {
  variantSku: string;
  channel?: string | null;
  sellerId?: string | null;
  integrationId?: string | null;
}

export interface ListingDraftCandidateVariantResult {
  baseProductSku: string;
  sabrVariantSku: string;
  name: string;
  isActive: boolean;
}

export interface ListingDraftGetResult {
  draft?: ListingDraftResult | null;
  candidates: ListingDraftCandidateVariantResult[];
  resolvedVariantSku?: string | null;
  availableStock?: number | null;
  stockSource?: 'ExactVariant' | 'AutoBestVariant' | 'FallbackZero' | string;
  suggestedCategoryId?: string | null;
  suggestedCategorySource?: string | null;
  suggestedCategoryPath?: string | null;
  categoryResolutionStatus?: 'Ready' | 'SelectionRequired' | 'ReviewRequired' | string | null;
  categoryResolutionReason?:
    | 'READY_SINGLE_MATCH'
    | 'SELECTION_REQUIRED_MULTIPLE_MATCHES'
    | 'REVIEW_REQUIRED_STALE_DRAFT'
    | 'ML_UNAVAILABLE'
    | 'ML_AUTH_INVALID'
    | string
    | null;
  categorySelectionRequired?: boolean | null;
  categoryLockAvailable?: boolean | null;
  categorySuggestions?: CategorySuggestionOptionResult[] | null;
}

export interface CategorySuggestionOptionResult {
  categoryId: string;
  categoryName?: string | null;
  categoryPathFromRoot?: string | null;
  source?: 'lock' | 'mapping' | 'domain_discovery' | 'lock_cache' | string;
  rank?: number | null;
}

export interface ListingDraftValidationIssueResult {
  fieldPath: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  step: string;
}

export interface ListingDraftValidateResult {
  draftId: string;
  isValid: boolean;
  status: string;
  rowVersion: string;
  issues: ListingDraftValidationIssueResult[];
}

export interface ListingDraftPublishVariationResult {
  sabrVariantSku: string;
  status: string;
  variationId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  publishedAtUtc?: string | null;
}

export interface ListingDraftPublishResult {
  draftId: string;
  status: string;
  rowVersion: string;
  updatedAt: string;
  publishedItemId?: string | null;
  publishedVariationId?: string | null;
  publishedPermalink?: string | null;
  publishedApiUrl?: string | null;
  effectiveQuantity?: number | null;
  warnings: string[];
  variationResults: ListingDraftPublishVariationResult[];
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastErrorAt?: string | null;
}

export interface ListingPublicationsQueryRequest {
  integrationId?: string | null;
  channel?: string | null;
  variantSkus?: string[] | null;
  sellerId?: string | null;
  status?: string | null;
  search?: string | null;
  skip?: number;
  limit?: number;
}

export interface ListingPublicationItemResult {
  draftId: string;
  integrationId: string;
  sellerId: string;
  baseProductSku: string;
  sabrVariantSku: string;
  status: string;
  categoryId?: string | null;
  listingTypeId?: string | null;
  price?: number | null;
  currencyId: string;
  publishedItemId?: string | null;
  publishedVariationId?: string | null;
  publishedPermalink?: string | null;
  publishedApiUrl?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastErrorAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingPublicationsQueryResult {
  total: number;
  skip: number;
  limit: number;
  items: ListingPublicationItemResult[];
}

export interface MarketplaceCategoryAttributesRequest {
  integrationId?: string | null;
  channel?: string | null;
  sellerId?: string | null;
  siteId?: string | null;
  categoryId?: string | null;
}

export interface MarketplaceCategoryAttributeValueResult {
  id: string;
  name: string;
}

export interface MarketplaceCategoryAttributeResult {
  id: string;
  name: string;
  required: boolean;
  conditional: boolean;
  isVariation: boolean;
  valueType?: string | null;
  values: MarketplaceCategoryAttributeValueResult[];
  tags: Record<string, string>;
}

export interface MarketplaceCategoryAttributesResult {
  categoryName?: string | null;
  categoryPathFromRoot?: string | null;
  allowsVariations: boolean;
  maxVariationsAllowed: number;
  maxVariationAttributes: number;
  allowedVariationAttributes: string[];
  allowedAxes: string[];
  requiredAttributes: MarketplaceCategoryAttributeResult[];
  conditionalAttributes: MarketplaceCategoryAttributeResult[];
  optionalAttributes?: MarketplaceCategoryAttributeResult[];
}

export interface MarketplaceCategorySuggestRequest {
  channel?: string | null;
  sellerId?: string | null;
  siteId?: string | null;
  query?: string | null;
}

export interface MarketplaceCategorySuggestItemResult {
  categoryId: string;
  categoryName: string;
  siteId?: string | null;
  domainId?: string | null;
  domainName?: string | null;
  source?: 'domain_discovery' | 'lock_cache' | string | null;
  score?: number | null;
  pathFromRoot?: string | null;
}

export type MarketplaceCategorySuggestDegradedReason = 'ML_UNAVAILABLE' | 'TIMEOUT' | 'ML_AUTH_INVALID';

export interface MarketplaceCategorySuggestResult {
  items: MarketplaceCategorySuggestItemResult[];
  degraded?: boolean;
  reason?: MarketplaceCategorySuggestDegradedReason | null;
  traceId?: string | null;
}

export interface MarketplaceFeesEstimateRequest {
  integrationId?: string | null;
  channel?: string | null;
  sellerId?: string | null;
  siteId?: string | null;
  categoryId?: string | null;
  listingTypeId?: string | null;
  price?: number | null;
  currencyId?: string | null;
  productCost?: number | null;
  operationalCost?: number | null;
}

export interface MarketplaceFeesEstimateResult {
  integrationId: string;
  sellerId: string;
  categoryId: string;
  listingTypeId: string;
  currencyId: string;
  price: number;
  saleFee: number;
  fixedFee: number;
  totalFees: number;
  productCost: number;
  operationalCost: number;
  estimatedProfit: number;
  marginPercent?: number | null;
  source?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PublicationsService {
  private readonly apiBaseUrl = environment.apiBaseUrl;
  private readonly categoryRegexBySite = new Map<string, RegExp>();

  constructor(private readonly http: HttpClient) {}

  upsertDraft(request: ListingDraftUpsertRequest): Observable<ListingDraftResult> {
    return this.http.post<ListingDraftResult>(`${this.apiBaseUrl}/api/v1/client/listings/drafts/upsert`, request);
  }

  getDraft(request: ListingDraftGetRequest): Observable<ListingDraftGetResult> {
    return this.http.post<ListingDraftGetResult>(`${this.apiBaseUrl}/api/v1/client/listings/drafts/get`, request);
  }

  validateDraft(draftId: string): Observable<ListingDraftValidateResult> {
    return this.http.post<ListingDraftValidateResult>(`${this.apiBaseUrl}/api/v1/client/listings/drafts/validate`, { draftId });
  }

  publishDraft(draftId: string, rowVersion: string): Observable<ListingDraftPublishResult> {
    return this.http.post<ListingDraftPublishResult>(`${this.apiBaseUrl}/api/v1/client/listings/drafts/publish`, {
      draftId,
      rowVersion
    });
  }

  queryPublications(request: ListingPublicationsQueryRequest): Observable<ListingPublicationsQueryResult> {
    return this.http.post<ListingPublicationsQueryResult>(`${this.apiBaseUrl}/api/v1/client/listings/publications/query`, request);
  }

  getCategoryAttributes(request: MarketplaceCategoryAttributesRequest): Observable<MarketplaceCategoryAttributesResult> {
    const normalizedSiteId = this.normalizeSiteId(request.siteId);
    const normalizedCategoryId = this.normalizeCategoryId(request.categoryId);
    if (!this.isValidMlCategoryId(normalizedCategoryId, normalizedSiteId)) {
      this.debugClientEvent('attributes_skipped_invalid_category', {
        siteId: normalizedSiteId,
        categoryId: normalizedCategoryId
      });
      return EMPTY;
    }

    return this.http.post<MarketplaceCategoryAttributesResult>(
      `${this.apiBaseUrl}/api/v1/client/marketplaces/categories/attributes`,
      {
        ...request,
        siteId: normalizedSiteId,
        categoryId: normalizedCategoryId
      }
    );
  }

  suggestCategories(request: MarketplaceCategorySuggestRequest): Observable<MarketplaceCategorySuggestResult> {
    return this.http.post<MarketplaceCategorySuggestResult>(
      `${this.apiBaseUrl}/api/v1/client/marketplaces/categories/suggest`,
      request
    );
  }

  estimateFees(request: MarketplaceFeesEstimateRequest): Observable<MarketplaceFeesEstimateResult> {
    const normalizedSiteId = this.normalizeSiteId(request.siteId);
    const normalizedCategoryId = this.normalizeCategoryId(request.categoryId);
    const listingTypeId = (request.listingTypeId ?? '').trim().toLowerCase();
    const price = typeof request.price === 'number' ? request.price : null;
    if (
      !this.isValidMlCategoryId(normalizedCategoryId, normalizedSiteId) ||
      !listingTypeId ||
      price == null ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      this.debugClientEvent('estimate_skipped_invalid_category', {
        siteId: normalizedSiteId,
        categoryId: normalizedCategoryId,
        listingTypeId,
        price
      });
      return EMPTY;
    }

    return this.http.post<MarketplaceFeesEstimateResult>(`${this.apiBaseUrl}/api/v1/client/marketplaces/fees/estimate`, {
      ...request,
      siteId: normalizedSiteId,
      categoryId: normalizedCategoryId,
      listingTypeId
    });
  }

  private normalizeSiteId(siteId?: string | null): string {
    const normalized = (siteId ?? '').trim().toUpperCase();
    return normalized || 'MLB';
  }

  private normalizeCategoryId(categoryId?: string | null): string {
    return (categoryId ?? '').trim().toUpperCase();
  }

  private buildCategoryRegex(siteId: string): RegExp {
    const cached = this.categoryRegexBySite.get(siteId);
    if (cached) {
      return cached;
    }

    const compiled = new RegExp(`^${this.escapeRegExp(siteId)}\\d+$`);
    this.categoryRegexBySite.set(siteId, compiled);
    return compiled;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isValidMlCategoryId(categoryId: string, siteId: string): boolean {
    if (!/^ML[A-Z]$/.test(siteId)) {
      return false;
    }

    if (!categoryId) {
      return false;
    }

    return this.buildCategoryRegex(siteId).test(categoryId);
  }

  private debugClientEvent(event: string, payload: Record<string, unknown>): void {
    if (environment.production || environment.authDebugConsole === false || typeof console === 'undefined') {
      return;
    }

    console.info(`[PUBLICATIONS][CLIENT] ${event}`, payload);
  }
}
