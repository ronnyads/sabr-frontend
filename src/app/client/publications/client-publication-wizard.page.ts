import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbInputModule, NbSelectModule, NbToastrService } from '@nebular/theme';
import { EMPTY, Observable, Subject, catchError, debounceTime, finalize, map, of, switchMap, takeUntil, tap } from 'rxjs';
import {
  CatalogVariantSnapshotIssue,
  CatalogVariantSnapshotResult,
  CatalogSnapshotService
} from '../../core/services/catalog-snapshot.service';
import { MercadoLivreConnectionStatusResult, MercadoLivreIntegrationService } from '../../core/services/mercado-livre-integration.service';
import { MyProductDraft, MyProductsService } from '../../core/services/my-products.service';
import {
  CategorySuggestionOptionResult,
  ListingDraftAttributeRequest,
  ListingDraftCandidateVariantResult,
  ListingDraftGetResult,
  ListingDraftImageRequest,
  ListingDraftPublishResult,
  ListingDraftResult,
  ListingDraftValidationIssueResult,
  MarketplaceCategoryAttributeResult,
  MarketplaceCategoryAttributeValueResult,
  MarketplaceCategoryAttributesResult,
  MarketplaceCategorySuggestDegradedReason,
  MarketplaceCategorySuggestItemResult,
  MarketplaceFeesEstimateResult,
  PublicationsService
} from '../../core/services/publications.service';
import { UiStateComponent } from '../../shared/ui-state/ui-state.component';
import { environment } from '../../../environments/environment';

interface WizardState {
  channel: string;
  variantSku: string;
  integrationId: string;
  sellerId: string;
  siteId: string;
  categoryId: string;
  listingTypeId: string;
  condition: string;
  title: string;
  description: string;
  price: number | null;
  productCost: number | null;
  operationalCost: number | null;
  currencyId: string;
  gtin: string;
  emptyGtinReason: string;
  ncm: string;
  origin: string;
  images: ListingDraftImageRequest[];
  attributes: ListingDraftAttributeRequest[];
  publishMode: string;
  selectedVariantSkus: string[];
  variationAxes: string[];
}

interface PublicationRouterStatePrefill {
  variantSku?: string;
  titleSuggestion?: string;
  purchaseCost?: number | null;
  purchaseCostScale?: 'brl' | 'cents' | null;
  catalogPrice?: number | null;
  catalogPriceScale?: 'brl' | 'cents' | null;
  images?: Array<{ url: string; position?: number }>;
  gtin?: string | null;
  ncm?: string | null;
  origin?: string | null;
  description?: string | null;
}

type PrefillField = 'title' | 'description' | 'gtin' | 'ncm' | 'origin';
type PrefillOriginField = PrefillField | 'images' | 'productCost';
type CategoryValidityReason = 'empty' | 'site_invalid' | 'format_invalid' | 'ok';
type AutoEstimatePauseReason = 'unavailable' | 'category_invalid' | null;
type CategoryGuardEndpoint = 'queue_estimate' | 'fees_estimate' | 'category_attributes';

interface CategoryValidityState {
  isValid: boolean;
  normalizedSiteId: string;
  normalizedCategoryId: string;
  reason: CategoryValidityReason;
}

interface MlRecentCategory {
  categoryId: string;
  siteId: string;
  sellerId: string;
  label?: string | null;
  lastUsedAt: number;
}

type CategorySelectSource = 'suggestion' | 'selected' | 'recent';
type MoneyScale = 'brl' | 'cents' | null;

interface CategorySelectOption {
  categoryId: string;
  label?: string | null;
  displayLabel: string;
  source: CategorySelectSource;
  suggestionItem?: MarketplaceCategorySuggestItemResult;
  recentItem?: MlRecentCategory;
}

interface CategorySelectGroup {
  key: CategorySelectSource;
  label: string;
  options: CategorySelectOption[];
}

const ML_RECENT_MAX = 8;
const ML_RECENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LISTING_TYPE_UI: Record<string, { label: string; hint: string }> = {
  gold_special: {
    label: 'ML Classico',
    hint: 'Geralmente tem taxa menor.'
  },
  gold_pro: {
    label: 'ML Gold',
    hint: 'Maior exposicao; pode exigir frete gratis conforme regras do ML/categoria.'
  }
};

@Component({
  selector: 'app-client-publication-wizard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbInputModule, NbSelectModule, UiStateComponent],
  templateUrl: './client-publication-wizard.page.html',
  styleUrls: ['./client-publication-wizard.page.scss']
})
export class ClientPublicationWizardPage implements OnInit, OnDestroy {
  readonly steps: Array<{ id: string; label: string }> = [
    { id: 'seller', label: 'canal e seller' },
    { id: 'category', label: 'categoria' },
    { id: 'content', label: 'conteudo' },
    { id: 'attributes', label: 'atributos' },
    { id: 'pricing', label: 'precos' },
    { id: 'fiscal', label: 'fiscal e imagens' },
    { id: 'review', label: 'revisao' }
  ];
  currentStepIndex = 0;

  loading = false;
  saving = false;
  validating = false;
  publishing = false;
  loadingCapabilities = false;
  loadingSnapshot = false;
  loadingCategorySuggest = false;
  loadingEstimate = false;
  errorMessage: string | null = null;
  missingVariantBlocked = false;
  missingVariantMessage: string | null = null;
  feesEstimateDegraded = false;
  feesEstimateTraceId: string | null = null;
  showFeesUnavailableBanner = false;
  feesInputInvalid = false;
  feesInputInvalidTraceId: string | null = null;
  autoEstimatePaused = false;
  autoEstimatePauseReason: AutoEstimatePauseReason = null;
  categoryAttributesUnavailable = false;
  categoryAttributesTraceId: string | null = null;
  showAttributesUnavailableBanner = false;
  categoryMlInvalid = false;
  categoryMlInvalidTraceId: string | null = null;
  publishInputInvalid = false;

  sellers: MercadoLivreConnectionStatusResult[] = [];
  categoryCapabilities: MarketplaceCategoryAttributesResult | null = null;
  estimate: MarketplaceFeesEstimateResult | null = null;
  lastPublishResult: ListingDraftPublishResult | null = null;
  issues: ListingDraftValidationIssueResult[] = [];
  snapshot: CatalogVariantSnapshotResult | null = null;
  snapshotIssues: CatalogVariantSnapshotIssue[] = [];
  categorySuggestions: MarketplaceCategorySuggestItemResult[] = [];
  categorySelectOptionsState: CategorySelectOption[] = [];
  categorySelectGroupsState: CategorySelectGroup[] = [];
  categorySelectFilteredOptionsState: CategorySelectOption[] = [];
  categorySelectFilterQuery = '';
  categorySelectOpen = false;
  categorySelectActiveIndex = -1;
  categorySuggestQuery = '';
  categoryIdInput = '';
  categoryValidity: CategoryValidityState = {
    isValid: false,
    normalizedSiteId: 'MLB',
    normalizedCategoryId: '',
    reason: 'empty'
  };
  categorySuggestDegraded = false;
  categorySuggestReason: MarketplaceCategorySuggestDegradedReason | null = null;
  categorySuggestTraceId: string | null = null;
  categoryAutofilledFromGet = false;
  selectedCategoryLabel: string | null = null;
  categoryUpdateRequired = false;
  categoryUpdateSuggestionId: string | null = null;
  categoryUpdateSuggestionLabel: string | null = null;
  showCategoryUpdateSuggestion = false;
  categoryResolutionReason: string | null = null;
  categoryResolutionBlockedByMl = false;
  recentCategories: MlRecentCategory[] = [];
  optionalCategoryAttributesState: MarketplaceCategoryAttributeResult[] = [];
  showOptionalAttributes = false;
  showAllOptionalAttributes = false;
  optionalAttributesQuery = '';
  readonly optionalAttributesPreviewLimit = 8;
  suggestRetryAttempt = 0;
  suggestAutoPaused = false;
  suggestRetryNextAt: number | null = null;
  mlAuthInvalid = false;
  pendingCategoryClear = false;
  showTechnicalDetails = false;
  salePriceInput = '';
  priceInputInvalid = false;
  private autosaveInFlight = false;
  private autosavePending = false;
  private autosaveConflictRetryArmed = false;
  private autosaveLastToastAt = 0;
  private readonly autosaveToastThrottleMs = 5000;

  draftId: string | null = null;
  rowVersion = '';
  lastValidatedRowVersion: string | null = null;
  lastValidationIsValid = false;
  variantCandidates: string[] = [];
  candidateVariants: ListingDraftCandidateVariantResult[] = [];
  showVariantCsvAdvanced = false;
  desiredMarginPercent = 20;
  draftStatus = 'Draft';

  state: WizardState = {
    channel: 'mercadolivre',
    variantSku: '',
    integrationId: '',
    sellerId: '',
    siteId: 'MLB',
    categoryId: '',
    listingTypeId: 'gold_special',
    condition: 'new',
    title: '',
    description: '',
    price: null,
    productCost: null,
    operationalCost: null,
    currencyId: 'BRL',
    gtin: '',
    emptyGtinReason: '',
    ncm: '',
    origin: '',
    images: [],
    attributes: [],
    publishMode: 'SingleVariant',
    selectedVariantSkus: [],
    variationAxes: []
  };

  private readonly autosave$ = new Subject<void>();
  private readonly estimate$ = new Subject<void>();
  private readonly categorySuggest$ = new Subject<string>();
  private readonly categoryCapabilitiesLoad$ = new Subject<void>();
  private readonly variantSelection$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();
  private prefillHydrating = false;
  private routerPrefill: PublicationRouterStatePrefill | null = null;
  private lastLoadedCategoryId: string | null = null;
  private categoryCapabilitiesRequestSeq = 0;
  private latestCategoryCapabilitiesRequestSeq = 0;
  private autoEstimateRetryKey: string | null = null;
  private autoEstimatePausedKey: string | null = null;
  private autoEstimateRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly autoFailureStats: Record<string, { count: number; lastToastAt: number }> = {};
  private readonly categoryRegexBySite = new Map<string, RegExp>();
  private readonly categoryLabelById = new Map<string, string>();
  private readonly categorySkipKeys: Partial<Record<CategoryGuardEndpoint, string>> = {};
  private lastCategoryOptionsKey = '';
  private readonly autoSelectedCategoryKeys = new Set<string>();
  private readonly optionalAttributeOptionsById = new Map<string, MarketplaceCategoryAttributeValueResult[]>();
  private readonly notApplicableTokens = new Set<string>([
    'NA',
    'NOTAPPLICABLE',
    'NOTAPPLICABLEVALUE',
    'NAOAPLICAVEL',
    'SEMAPLICACAO'
  ]);
  private readonly runtimeSignature = 'wizard-legacy-category-clear-20260220';
  private snapshotRequestSeq = 0;
  private latestSnapshotRequestSeq = 0;
  prefillOrigins: Partial<Record<PrefillOriginField, string>> = {};

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly publicationsService: PublicationsService,
    private readonly catalogSnapshotService: CatalogSnapshotService,
    private readonly myProductsService: MyProductsService,
    private readonly integrationService: MercadoLivreIntegrationService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.debugWizardEvent('runtime_signature', {
      signature: this.runtimeSignature
    });
    this.syncSalePriceInputFromState();

    this.autosave$
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => this.runAutosave());
    this.estimate$
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(() => this.estimateFees());
    this.categorySuggest$
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe((query) => this.fetchCategorySuggestions(query));
    this.categoryCapabilitiesLoad$
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(() => this.loadCategoryCapabilities());
    this.variantSelection$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((sku) => {
          const normalizedSku = (sku ?? '').trim().toUpperCase();
          if (!normalizedSku) {
            this.loadingSnapshot = false;
            this.loading = false;
            return EMPTY;
          }

          this.clearMissingVariantBlock();
          const requestSeq = ++this.snapshotRequestSeq;
          this.latestSnapshotRequestSeq = requestSeq;
          this.loadingSnapshot = true;
          this.errorMessage = null;
          return this.catalogSnapshotService.getVariantSnapshot({ variantSku: normalizedSku }).pipe(
            catchError((error: HttpErrorResponse) => {
              if (requestSeq !== this.latestSnapshotRequestSeq) {
                return EMPTY;
              }

              this.loadingSnapshot = false;
              if (this.isSkuNotFoundError(error)) {
                this.setMissingVariantBlock();
                this.loading = false;
                return EMPTY;
              }

              this.loading = false;
              this.errorMessage = this.buildErrorMessage('Falha ao carregar snapshot do SKU.', error);
              return EMPTY;
            })
          );
        })
      )
      .subscribe((snapshot) => {
        this.loadingSnapshot = false;
        this.snapshot = snapshot;
        this.snapshotIssues = snapshot.qualityIssues ?? [];
        const resolvedVariantSku = ((snapshot.resolvedVariantSku ?? snapshot.variantSku) || '').trim().toUpperCase();
        if (resolvedVariantSku) {
          this.state.variantSku = resolvedVariantSku;
        }
        this.fetchDraftForVariant(resolvedVariantSku || this.state.variantSku);
      });

    this.loadContext();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearAutoEstimateRetryTimer();
    this.clearSuggestRetryTimer();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get currentStep(): string {
    return this.steps[this.currentStepIndex]?.id ?? 'review';
  }

  get currentStepSectionId(): string {
    return this.getSectionId(this.currentStep);
  }

  get hasPreviousStep(): boolean {
    return this.currentStepIndex > 0;
  }

  get hasNextStep(): boolean {
    return !this.missingVariantBlocked && this.currentStepIndex < this.steps.length - 1;
  }

  get canValidate(): boolean {
    return (
      !!this.draftId &&
      !this.validating &&
      !this.publishing &&
      !this.isCategoryUpdateResolutionPending &&
      this.categoryValidity.isValid &&
      !this.missingVariantBlocked &&
      !this.mlAuthInvalid &&
      !this.isAttributesGateBlocked &&
      !this.categoryMlInvalid &&
      !this.feesInputInvalid
    );
  }

  get canPublish(): boolean {
    return (
      !!this.draftId &&
      !!this.rowVersion &&
      this.lastValidationIsValid &&
      this.lastValidatedRowVersion === this.rowVersion &&
      !this.validating &&
      !this.publishing &&
      !this.isCategoryUpdateResolutionPending &&
      this.categoryValidity.isValid &&
      !this.missingVariantBlocked &&
      !this.mlAuthInvalid &&
      !this.isAttributesGateBlocked &&
      !this.categoryMlInvalid &&
      !this.feesInputInvalid &&
      !this.publishInputInvalid &&
      !this.hasBlockingChecklistErrors
    );
  }

  get canEstimate(): boolean {
    return (
      !!this.state.integrationId &&
      !!this.state.listingTypeId.trim() &&
      !this.isCategoryUpdateResolutionPending &&
      this.categoryValidity.isValid &&
      !this.priceInputInvalid &&
      !!this.state.price &&
      this.state.price > 0
    );
  }

  get isCategoryUpdateResolutionPending(): boolean {
    return this.categoryUpdateRequired && !this.state.categoryId.trim();
  }

  get canLoadCategoryCapabilities(): boolean {
    return !!this.state.integrationId && this.categoryValidity.isValid;
  }

  get suggestCooldownSeconds(): number {
    if (!this.suggestRetryNextAt) {
      return 0;
    }

    return Math.max(0, Math.ceil((this.suggestRetryNextAt - Date.now()) / 1000));
  }

  get canRetrySuggestNow(): boolean {
    if (this.loadingCategorySuggest) {
      return false;
    }

    return this.suggestRetryNextAt == null || Date.now() >= this.suggestRetryNextAt;
  }

  get showRecentCategoriesFallback(): boolean {
    if (this.mlAuthInvalid || !!this.state.categoryId.trim()) {
      return false;
    }

    if (this.recentCategories.length === 0) {
      return false;
    }

    return this.categorySuggestDegraded || this.categorySuggestions.length === 0;
  }

  get categoryActionDisabledMessage(): string {
    if (!this.state.integrationId) {
      return 'Selecione um seller/integracao para continuar.';
    }

    if (this.categoryValidity.reason === 'empty') {
      return 'Selecione uma categoria do ML para carregar atributos.';
    }

    if (this.categoryValidity.reason === 'site_invalid') {
      return `Site invalido. Use o formato MLX (ex.: MLB, MLA).`;
    }

    if (this.categoryValidity.reason === 'format_invalid') {
      return `Categoria invalida para o site ${this.categoryValidity.normalizedSiteId}. Selecione uma categoria valida do ML.`;
    }

    return '';
  }

  get estimateBlockingMessage(): string {
    const missing: string[] = [];
    if (this.isCategoryUpdateResolutionPending) {
      missing.push('Categoria atualizada no painel (aplique a recomendada ou escolha outra)');
    }

    if (this.priceInputInvalid) {
      missing.push('Preco de venda valido no formato BRL');
    }

    if (!this.categoryValidity.isValid) {
      if (this.categoryValidity.reason === 'site_invalid') {
        missing.push('Site valido (MLX)');
      } else if (this.categoryValidity.reason === 'format_invalid') {
        missing.push('Categoria valida do ML');
      } else {
        missing.push('Categoria do ML');
      }
    }

    if (!this.state.price || this.state.price <= 0) {
      missing.push('Preco de venda > 0');
    }

    if (!this.state.listingTypeId.trim()) {
      missing.push('Tipo de anuncio');
    }

    if (missing.length === 0) {
      return '';
    }

    return `Informe ${missing.join(' e ')} para calcular taxas.`;
  }

  get hasCategoryEstimateError(): boolean {
    return !this.categoryValidity.isValid;
  }

  get hasCategoryLocalFormatError(): boolean {
    return this.categoryValidity.reason === 'site_invalid' || this.categoryValidity.reason === 'format_invalid';
  }

  get categoryLocalFormatMessage(): string {
    if (this.categoryValidity.reason === 'site_invalid') {
      return 'Site invalido. Use o formato MLX (ex.: MLB, MLA).';
    }

    if (this.categoryValidity.reason === 'format_invalid') {
      return `Categoria invalida para o site ${this.categoryValidity.normalizedSiteId}. Selecione uma categoria sugerida.`;
    }

    return '';
  }

  get hasCategoryMlInvalidError(): boolean {
    return this.categoryMlInvalid;
  }

  get hasPriceEstimateError(): boolean {
    return this.priceInputInvalid || !this.state.price || this.state.price <= 0;
  }

  get hasListingTypeEstimateError(): boolean {
    return !this.state.listingTypeId.trim() || this.feesInputInvalid;
  }

  get feesInputInvalidMessage(): string {
    if (!this.feesInputInvalid) {
      return '';
    }

    const suffix = this.feesInputInvalidTraceId ? ` (traceId: ${this.feesInputInvalidTraceId})` : '';
    return `Categoria, tipo de anuncio ou preco invalidos no Mercado Livre.${suffix}`;
  }

  get categoryMlInvalidMessage(): string {
    if (!this.categoryMlInvalid) {
      return '';
    }

    const suffix = this.categoryMlInvalidTraceId ? ` (traceId: ${this.categoryMlInvalidTraceId})` : '';
    return `Categoria invalida para o site selecionado. Selecione uma categoria sugerida.${suffix}`;
  }

  get selectedCategoryDisplayValue(): string {
    const categoryId = this.state.categoryId.trim();
    if (!categoryId) {
      return 'Nenhuma categoria selecionada';
    }

    const label = this.normalizeCategoryLabel(this.selectedCategoryLabel) ?? this.resolveSelectedCategoryLabel(categoryId);
    return label ?? 'Carregando categoria...';
  }

  get categorySummaryLabel(): string {
    const categoryId = this.state.categoryId.trim();
    if (!categoryId) {
      return '-';
    }

    const label = this.normalizeCategoryLabel(this.selectedCategoryLabel) ?? this.resolveSelectedCategoryLabel(categoryId);
    return label ?? 'Carregando categoria...';
  }

  get reviewCategoryLabel(): string {
    const categoryId = this.state.categoryId.trim();
    if (!categoryId) {
      return 'Defina uma categoria';
    }

    const label = this.normalizeCategoryLabel(this.selectedCategoryLabel) ?? this.resolveSelectedCategoryLabel(categoryId);
    return label ?? 'Carregando categoria...';
  }

  get categorySelectValue(): string {
    return this.normalizeCategoryId(this.state.categoryId);
  }

  get categorySelectTriggerLabel(): string {
    return this.state.categoryId.trim() ? this.selectedCategoryDisplayValue : 'Selecione uma categoria';
  }

  get hasCategorySelectFilteredOptions(): boolean {
    return this.categorySelectFilteredOptionsState.length > 0;
  }

  get categoryResolutionBlockedMessage(): string {
    if (!this.categoryResolutionBlockedByMl) {
      return '';
    }

    const reason = (this.categoryResolutionReason ?? '').toUpperCase();
    if (reason === 'ML_AUTH_INVALID') {
      return 'Categoria indisponivel no ML por autenticacao da integracao. Reconecte e tente novamente, ou selecione manualmente uma categoria recente.';
    }

    return 'Categoria indisponivel no ML no momento. Tente novamente em instantes, ou selecione manualmente uma categoria recente.';
  }

  trackByCategoryId(_: number, option: CategorySelectOption): string {
    return option.categoryId;
  }

  trackByCategoryGroup(_: number, group: CategorySelectGroup): string {
    return group.key;
  }

  trackByAttributeId(_: number, attribute: MarketplaceCategoryAttributeResult): string {
    return attribute.id;
  }

  get filteredOptionalAttributes(): MarketplaceCategoryAttributeResult[] {
    const query = (this.optionalAttributesQuery ?? '').trim().toLowerCase();
    if (!query) {
      return this.optionalCategoryAttributesState;
    }

    return this.optionalCategoryAttributesState.filter((attribute) => {
      const base = `${attribute.name} ${attribute.id}`.toLowerCase();
      if (base.includes(query)) {
        return true;
      }

      return attribute.values.some((value) => value.name.toLowerCase().includes(query) || value.id.toLowerCase().includes(query));
    });
  }

  get visibleOptionalAttributes(): MarketplaceCategoryAttributeResult[] {
    if (this.showAllOptionalAttributes) {
      return this.filteredOptionalAttributes;
    }

    return this.filteredOptionalAttributes.slice(0, this.optionalAttributesPreviewLimit);
  }

  toggleOptionalAttributes(): void {
    this.showOptionalAttributes = !this.showOptionalAttributes;
  }

  toggleShowAllOptionalAttributes(): void {
    this.showAllOptionalAttributes = !this.showAllOptionalAttributes;
  }

  onOptionalAttributesQueryChange(query: string): void {
    this.optionalAttributesQuery = query ?? '';
    this.showAllOptionalAttributes = false;
  }

  isCategoryOptionActive(index: number): boolean {
    return index === this.categorySelectActiveIndex;
  }

  isCategoryOptionActiveById(categoryId: string): boolean {
    const activeOption = this.categorySelectFilteredOptionsState[this.categorySelectActiveIndex];
    return !!activeOption && activeOption.categoryId === this.normalizeCategoryId(categoryId);
  }

  get titleLength(): number {
    return this.state.title.trim().length;
  }

  get descriptionLength(): number {
    return this.state.description.trim().length;
  }

  get selectedSellerDisplayName(): string {
    const selected = this.sellers.find((item) => item.sellerId === this.state.sellerId);
    if (!selected) {
      return '-';
    }

    return selected.nickname?.trim() ? selected.nickname.trim() : `Seller ${selected.sellerId}`;
  }

  get selectedSellerTechnicalLabel(): string {
    const selected = this.sellers.find((item) => item.sellerId === this.state.sellerId);
    if (!selected) {
      return '-';
    }

    return selected.nickname ? `${selected.sellerId} - ${selected.nickname}` : selected.sellerId;
  }

  get selectedSellerLabel(): string {
    return this.selectedSellerDisplayName;
  }

  get listingTypeDisplayName(): string {
    const normalized = (this.state.listingTypeId ?? '').trim().toLowerCase();
    return LISTING_TYPE_UI[normalized]?.label ?? 'Tipo de anuncio';
  }

  get listingTypeHint(): string {
    const normalized = (this.state.listingTypeId ?? '').trim().toLowerCase();
    return LISTING_TYPE_UI[normalized]?.hint ?? 'Selecione um tipo de anuncio valido.';
  }

  get listingTypeFeePercentLabel(): string {
    return this.saleFeePercentLabel;
  }

  get saleFeePercentLabel(): string {
    return this.formatFeePercentLabel(this.estimatedVariableFeeRate);
  }

  get totalFeePercentLabel(): string {
    return this.formatFeePercentLabel(this.estimatedTotalFeeRate);
  }

  get suggestedTitle(): string {
    if (this.state.title.trim()) {
      return this.state.title.trim();
    }

    const candidateName = this.getCandidateNameFor(this.state.variantSku);
    if (candidateName) {
      return candidateName;
    }

    return this.state.variantSku ? `Produto ${this.state.variantSku}` : '';
  }

  get displayProductName(): string {
    if (this.state.title.trim()) {
      return this.state.title.trim();
    }

    const candidateName = this.getCandidateNameFor(this.state.variantSku);
    if (candidateName) {
      return candidateName;
    }

    return this.state.variantSku || 'Produto sem nome';
  }

  get displayPrimaryImageUrl(): string | null {
    const first = this.state.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .find((item) => !!item.url?.trim());
    return first?.url ?? null;
  }

  get selectedVariantCount(): number {
    return this.state.selectedVariantSkus.length;
  }

  get displayStockAvailable(): number {
    return this.snapshot?.stockAvailable ?? 0;
  }

  get effectiveProductCost(): number | null {
    if (typeof this.state.productCost === 'number' && Number.isFinite(this.state.productCost)) {
      return this.state.productCost;
    }

    if (typeof this.snapshot?.catalogPrice === 'number' && Number.isFinite(this.snapshot.catalogPrice)) {
      return this.snapshot.catalogPrice;
    }

    return null;
  }

  get displaySnapshotCost(): number {
    return this.effectiveProductCost ?? 0;
  }

  get requiredAttributesCompleted(): number {
    const required = this.categoryCapabilities?.requiredAttributes ?? [];
    if (required.length === 0) {
      return 0;
    }

    return required.filter((attr) => this.isRequiredAttributeFilled(attr)).length;
  }

  get totalChecklistItems(): number {
    return 6;
  }

  get checklistCompletedItems(): number {
    let completed = 0;
    if (this.isCategoryReady) completed += 1;
    if (this.isTitleReady) completed += 1;
    if (this.isGtinOrReasonReady) completed += 1;
    if (this.isNcmReady) completed += 1;
    if (this.isImagesReady) completed += 1;
    if (this.isRequiredAttributesReady) completed += 1;
    return completed;
  }

  get checklistCompletionPercent(): number {
    return Math.round((this.checklistCompletedItems / this.totalChecklistItems) * 100);
  }

  get isCategoryReady(): boolean {
    return this.categoryValidity.isValid && !this.categoryMlInvalid && !this.isCategoryUpdateResolutionPending;
  }

  get isTitleReady(): boolean {
    const len = this.titleLength;
    return len > 0 && len <= 60;
  }

  get isGtinOrReasonReady(): boolean {
    return !!this.state.gtin.trim() || !!this.state.emptyGtinReason.trim();
  }

  get isNcmReady(): boolean {
    return /^\d{8}$/.test(this.state.ncm.trim());
  }

  get isImagesReady(): boolean {
    return this.state.images.length >= 1;
  }

  get isRequiredAttributesReady(): boolean {
    if (this.isAttributesGateBlocked) {
      return false;
    }

    const required = this.categoryCapabilities?.requiredAttributes ?? [];
    if (required.length === 0) {
      return true;
    }

    return required.every((attr) => this.isRequiredAttributeFilled(attr));
  }

  get isAttributesGateBlocked(): boolean {
    return !!this.state.categoryId.trim() && this.categoryAttributesUnavailable;
  }

  get hasBlockingChecklistErrors(): boolean {
    return (
      !this.isCategoryReady ||
      !this.isTitleReady ||
      !this.isGtinOrReasonReady ||
      !this.isNcmReady ||
      !this.isImagesReady ||
      !this.isRequiredAttributesReady ||
      this.isAttributesGateBlocked ||
      this.categoryMlInvalid ||
      this.feesInputInvalid
    );
  }

  get estimatedVariableFeeRate(): number {
    if (!this.estimate || !this.state.price || this.state.price <= 0) {
      return 0;
    }

    const rate = this.estimate.saleFee / this.state.price;
    if (!Number.isFinite(rate) || rate < 0) {
      return 0;
    }

    return rate;
  }

  get estimatedTotalFeeRate(): number {
    if (!this.estimate || !this.state.price || this.state.price <= 0) {
      return 0;
    }

    const rate = this.estimate.totalFees / this.state.price;
    if (!Number.isFinite(rate) || rate < 0) {
      return 0;
    }

    return rate;
  }

  get minimumPriceForTargetMargin(): number | null {
    if (!this.estimate) {
      return null;
    }

    const desiredMarginRate = Math.max(0, this.desiredMarginPercent) / 100;
    const variableFeeRate = this.estimatedVariableFeeRate;
    const denominator = 1 - variableFeeRate - desiredMarginRate;
    if (denominator <= 0) {
      return null;
    }

    const totalBaseCost = (this.effectiveProductCost ?? 0) + (this.state.operationalCost ?? 0) + (this.estimate.fixedFee ?? 0);
    const minimum = totalBaseCost / denominator;
    if (!Number.isFinite(minimum) || minimum <= 0) {
      return null;
    }

    return this.roundMoneyValue(minimum);
  }

  get suggestedPriceByTargetMargin(): number | null {
    const minimum = this.minimumPriceForTargetMargin;
    if (minimum == null) {
      return null;
    }

    if (!this.state.price || this.state.price <= 0) {
      return minimum;
    }

    return this.roundMoneyValue(Math.max(this.state.price, minimum));
  }

  get currentPriceMeetsTargetMargin(): boolean {
    const minimum = this.minimumPriceForTargetMargin;
    if (minimum == null || !this.state.price || this.state.price <= 0) {
      return false;
    }

    return this.roundMoneyValue(this.state.price) >= minimum;
  }

  get severityErrors(): number {
    return this.issues.filter((item) => (item.severity || 'error') === 'error').length;
  }

  get severityWarnings(): number {
    return this.issues.filter((item) => item.severity === 'warning').length;
  }

  get gtinPrefillSourceLabel(): string | null {
    const source = this.prefillOrigins.gtin;
    if (!source) {
      return null;
    }

    return source === 'routerState'
      ? 'router state'
      : source === 'myProducts'
        ? '/my-products'
        : source === 'snapshot'
          ? 'snapshot catálogo'
          : source;
  }

  nextStep(): void {
    if (!this.hasNextStep) {
      return;
    }

    this.goToStep(this.currentStepIndex + 1);
  }

  previousStep(): void {
    if (!this.hasPreviousStep) {
      return;
    }

    this.goToStep(this.currentStepIndex - 1);
  }

  goToStep(index: number): void {
    if (this.missingVariantBlocked) {
      return;
    }

    if (index < 0 || index >= this.steps.length) {
      return;
    }

    this.currentStepIndex = index;
    const step = this.steps[index];
    const sectionId = this.getSectionId(step.id);
    const section = typeof document !== 'undefined' ? document.getElementById(sectionId) : null;
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private goToStepById(stepId: string): void {
    const index = this.steps.findIndex((step) => step.id === stepId);
    if (index < 0) {
      return;
    }

    this.goToStep(index);
  }

  toggleVariantCsvAdvanced(): void {
    this.showVariantCsvAdvanced = !this.showVariantCsvAdvanced;
  }

  selectVariantCandidate(value: string): void {
    const normalized = (value ?? '').trim().toUpperCase();
    if (!normalized) {
      return;
    }

    this.state.variantSku = normalized;
    this.state.selectedVariantSkus = [normalized];
    this.variantSelection$.next(normalized);
    this.queueAutosave();
  }

  copySuggestedTitle(): void {
    const value = this.suggestedTitle.trim();
    if (!value) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
      this.toastr.success('Sugestao copiada.', 'Publicacoes');
      return;
    }

    this.state.title = value;
    this.queueAutosave();
    this.toastr.info('Clipboard indisponivel. Sugestao aplicada no titulo.', 'Publicacoes');
  }

  toggleTechnicalDetails(): void {
    this.showTechnicalDetails = !this.showTechnicalDetails;
  }

  applyCategoryUpdateSuggestion(): void {
    const suggestionId = this.normalizeCategoryId(this.categoryUpdateSuggestionId ?? '');
    if (!suggestionId) {
      return;
    }

    this.onCategoryIdChanged(suggestionId, 'manual_dropdown', this.categoryUpdateSuggestionLabel);
    this.toastr.success('Categoria atualizada com a sugestao do painel.', 'Publicacoes');
  }

  chooseAnotherCategory(): void {
    this.showCategoryUpdateSuggestion = false;
    this.autoSuggestCategoryIfNeeded();
    this.toastr.info('Selecione outra categoria para continuar.', 'Publicacoes');
  }

  clearSelectedCategory(): void {
    if (!this.state.categoryId.trim() && !this.categoryIdInput.trim()) {
      return;
    }

    this.categoryIdInput = '';
    this.state.categoryId = '';
    this.clearPublishInputInvalidState();
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.clearFeesInputInvalidState();
    this.refreshCategoryValidity(this.categoryIdInput);
    this.clearCategoryCapabilityState();
    this.categorySuggestions = [];
    this.refreshRecentCategories();
    this.categoryAutofilledFromGet = false;
    this.selectedCategoryLabel = null;
    this.categoryUpdateRequired = false;
    this.resetCategoryUpdateSuggestion();
    this.closeCategorySelect(true);
    this.rebuildCategorySelectOptions();
    this.pendingCategoryClear = true;
    this.queueAutosave();
    this.queueEstimate();
  }

  applySuggestedPrice(): void {
    const suggested = this.suggestedPriceByTargetMargin;
    if (!suggested) {
      this.toastr.warning('Nao foi possivel calcular preco sugerido.', 'Publicacoes');
      return;
    }

    this.state.price = suggested;
    this.priceInputInvalid = false;
    this.syncSalePriceInputFromState();
    this.onPricingFieldChanged();
    this.toastr.success('Preco sugerido aplicado.', 'Publicacoes');
  }

  onSellerChanged(value: string): void {
    this.state.sellerId = (value ?? '').trim();
    this.mlAuthInvalid = false;
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.clearFeesInputInvalidState();
    this.resumeAutoEstimate();
    this.lastLoadedCategoryId = null;
    const selected = this.sellers.find((item) => item.sellerId === this.state.sellerId);
    if (selected) {
      this.state.integrationId = selected.integrationId ?? this.state.integrationId;
    }
    this.refreshRecentCategories();
    this.refreshCategoryValidity(this.state.categoryId);
    this.queueAutosave();
    this.autoSuggestCategoryIfNeeded();
    if (this.categoryValidity.isValid) {
      this.categoryCapabilitiesLoad$.next();
    }
    this.queueEstimate();
  }

  onSiteIdChanged(value: string): void {
    this.state.siteId = this.normalizeSiteId(value);
    this.clearPublishInputInvalidState();
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.clearFeesInputInvalidState();
    this.lastLoadedCategoryId = null;
    this.refreshRecentCategories();
    this.refreshCategoryValidity(this.state.categoryId);
    this.state.categoryId = this.categoryValidity.isValid ? this.categoryValidity.normalizedCategoryId : '';
    this.selectedCategoryLabel = this.state.categoryId ? this.resolveSelectedCategoryLabel(this.state.categoryId) : null;
    this.rebuildCategorySelectOptions();
    if (!this.categoryValidity.isValid) {
      this.clearCategoryCapabilityState();
      this.pauseAutoEstimateForInvalidCategory(this.categoryValidity, 'site_changed');
    } else {
      this.resumeAutoEstimate();
      this.categoryAttributesUnavailable = false;
      this.categoryAttributesTraceId = null;
      this.categoryCapabilitiesLoad$.next();
    }
    this.queueAutosave();
    this.queueEstimate();
  }

  onFieldChanged(): void {
    this.clearPublishInputInvalidState();
    if (this.state.gtin.trim() && this.state.emptyGtinReason.trim()) {
      this.state.emptyGtinReason = '';
    }
    this.queueAutosave();
  }

  onPricingFieldChanged(): void {
    this.clearPublishInputInvalidState();
    this.clearFeesInputInvalidState();
    this.resumeAutoEstimate();
    this.queueAutosave();
    this.queueEstimate();
  }

  onSalePriceInputChanged(value: string): void {
    this.salePriceInput = value ?? '';
    this.priceInputInvalid = false;

    const parsed = this.tryParseBrlPriceInput(this.salePriceInput, false);
    if (parsed == null) {
      if (!this.salePriceInput.trim() && this.state.price != null) {
        this.state.price = null;
        this.onPricingFieldChanged();
      }
      return;
    }

    if (this.state.price !== parsed) {
      this.state.price = parsed;
      this.onPricingFieldChanged();
    }
  }

  onSalePriceInputBlur(): void {
    const parsed = this.tryParseBrlPriceInput(this.salePriceInput, true);
    if (parsed == null || parsed <= 0) {
      if (!this.salePriceInput.trim()) {
        if (this.state.price != null) {
          this.state.price = null;
          this.onPricingFieldChanged();
        }
        this.priceInputInvalid = false;
        this.salePriceInput = '';
        return;
      }

      this.debugWizardEvent('price_input_invalid', {
        raw: this.salePriceInput,
        variantSku: this.state.variantSku,
        listingTypeId: this.state.listingTypeId
      });
      this.priceInputInvalid = true;
      return;
    }

    this.priceInputInvalid = false;
    if (this.state.price !== parsed) {
      this.state.price = parsed;
      this.onPricingFieldChanged();
    }
    this.syncSalePriceInputFromState();
  }

  onSalePriceInputEnter(event: Event): void {
    event.preventDefault();
    this.onSalePriceInputBlur();
  }

  onCategorySearchChanged(value: string): void {
    this.categorySuggestQuery = value ?? '';
    this.resetSuggestRetryState();
    if (this.mlAuthInvalid) {
      return;
    }

    this.categorySuggest$.next(this.categorySuggestQuery);
  }

  suggestCategoryNow(): void {
    const fallbackQuery = (this.categorySuggestQuery || this.state.title || this.displayProductName || this.state.variantSku).trim();
    if (!fallbackQuery) {
      return;
    }

    this.fetchCategorySuggestions(fallbackQuery, true);
  }

  retryCategorySuggest(): void {
    if (!this.canRetrySuggestNow) {
      return;
    }

    this.suggestAutoPaused = false;
    const fallbackQuery = (this.categorySuggestQuery || this.state.title || this.displayProductName || this.state.variantSku).trim();
    if (!fallbackQuery) {
      return;
    }

    this.fetchCategorySuggestions(fallbackQuery, true, true);
  }

  calculateFeesNow(): void {
    this.resumeAutoEstimate();
    this.estimateFees({ manual: true });
  }

  applyCategorySuggestion(item: MarketplaceCategorySuggestItemResult, uiControl: 'list' | 'select' = 'list'): void {
    const categoryId = this.normalizeCategoryId(item.categoryId);
    if (!categoryId) {
      return;
    }

    const currentSiteId = this.normalizeSiteId(this.state.siteId);
    const suggestionSiteId = this.normalizeSiteId(item.siteId ?? undefined);
    if ((item.siteId ?? '').trim() && suggestionSiteId !== currentSiteId) {
      this.toastr.warning(`Essa sugestao e do site ${suggestionSiteId}. Troque o site para aplicar.`, 'Publicacoes');
      return;
    }

    const validity = this.validateCategory(currentSiteId, categoryId);
    if (!validity.isValid) {
      this.toastr.warning('Essa sugestao nao corresponde ao site atual do anuncio.', 'Publicacoes');
      return;
    }

    const suggestionLabel = this.resolveSellerCategoryLabel(item.categoryName, item.pathFromRoot);
    this.debugWizardEvent('category_selected_from_dropdown', {
      categoryId: validity.normalizedCategoryId,
      siteId: currentSiteId,
      query: this.categorySuggestQuery?.trim() || null,
      label: suggestionLabel,
      uiControl
    });
    this.onCategoryIdChanged(validity.normalizedCategoryId, 'manual_dropdown', suggestionLabel);
  }

  toggleCategorySelectOpen(): void {
    if (this.categorySelectOpen) {
      this.closeCategorySelect(true);
      return;
    }

    this.openCategorySelect();
  }

  openCategorySelect(): void {
    if (this.categorySelectOpen) {
      return;
    }

    this.categorySelectOpen = true;
    this.refreshCategorySelectGroups();
    this.setCategorySelectActiveByCategoryId(this.categorySelectValue);
  }

  closeCategorySelect(resetFilter = false): void {
    this.categorySelectOpen = false;
    this.categorySelectActiveIndex = -1;
    if (!resetFilter || !this.categorySelectFilterQuery) {
      return;
    }

    this.categorySelectFilterQuery = '';
    this.refreshCategorySelectGroups();
  }

  onCategorySelectContainerFocusOut(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement | null;
    const nextTarget = event.relatedTarget as Node | null;
    if (host && nextTarget && host.contains(nextTarget)) {
      return;
    }

    this.closeCategorySelect(false);
  }

  onCategorySelectTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.categorySelectOpen) {
        this.openCategorySelect();
      } else {
        this.moveCategorySelectActive(1);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.categorySelectOpen) {
        this.openCategorySelect();
      } else {
        this.moveCategorySelectActive(-1);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.categorySelectOpen) {
        this.openCategorySelect();
        return;
      }

      this.selectActiveCategoryOption();
      return;
    }

    if (event.key === 'Escape' && this.categorySelectOpen) {
      event.preventDefault();
      this.closeCategorySelect(true);
    }
  }

  onCategorySelectFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveCategorySelectActive(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveCategorySelectActive(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.selectActiveCategoryOption();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeCategorySelect(true);
    }
  }

  onCategorySelectFilterChanged(value: string): void {
    this.categorySelectFilterQuery = value ?? '';
    this.refreshCategorySelectGroups();
  }

  onCategoryOptionMouseEnter(indexOrCategoryId: number | string): void {
    const index = typeof indexOrCategoryId === 'number'
      ? indexOrCategoryId
      : this.categorySelectFilteredOptionsState.findIndex((option) => option.categoryId === this.normalizeCategoryId(indexOrCategoryId));
    if (index < 0) {
      return;
    }

    this.categorySelectActiveIndex = index;
  }

  selectCategoryOption(option: CategorySelectOption): void {
    this.closeCategorySelect(true);
    this.onCategorySelectChanged(option.categoryId);
  }

  private selectActiveCategoryOption(): void {
    if (!this.categorySelectOpen || this.categorySelectActiveIndex < 0) {
      return;
    }

    const option = this.categorySelectFilteredOptionsState[this.categorySelectActiveIndex];
    if (!option) {
      return;
    }

    this.selectCategoryOption(option);
  }

  private moveCategorySelectActive(step: number): void {
    const total = this.categorySelectFilteredOptionsState.length;
    if (total === 0) {
      this.categorySelectActiveIndex = -1;
      return;
    }

    if (this.categorySelectActiveIndex < 0) {
      this.categorySelectActiveIndex = step > 0 ? 0 : total - 1;
      return;
    }

    const next = (this.categorySelectActiveIndex + step + total) % total;
    this.categorySelectActiveIndex = next;
  }

  private setCategorySelectActiveByCategoryId(categoryIdRaw: string): void {
    const categoryId = this.normalizeCategoryId(categoryIdRaw);
    if (!categoryId || this.categorySelectFilteredOptionsState.length === 0) {
      this.categorySelectActiveIndex = this.categorySelectFilteredOptionsState.length > 0 ? 0 : -1;
      return;
    }

    const index = this.categorySelectFilteredOptionsState.findIndex((option) => option.categoryId === categoryId);
    this.categorySelectActiveIndex = index >= 0 ? index : 0;
  }

  onCategorySelectChanged(value: string): void {
    const categoryId = this.normalizeCategoryId(value);
    if (!categoryId) {
      return;
    }

    const selectedOption = this.categorySelectOptionsState.find((item) => item.categoryId === categoryId);
    if (!selectedOption) {
      return;
    }

    if (selectedOption.source === 'selected' && categoryId === this.categorySelectValue) {
      return;
    }

    if (selectedOption.source === 'suggestion' && selectedOption.suggestionItem) {
      this.applyCategorySuggestion(selectedOption.suggestionItem, 'select');
      return;
    }

    if (selectedOption.source === 'recent' && selectedOption.recentItem) {
      this.applyRecentCategory(selectedOption.recentItem);
      return;
    }

    this.onCategoryIdChanged(categoryId, 'manual_dropdown', selectedOption.label);
  }

  applyRecentCategory(item: MlRecentCategory): void {
    const normalizedSiteId = this.normalizeSiteId(this.state.siteId);
    if (item.siteId !== normalizedSiteId) {
      this.toastr.warning(`Essa sugestao e do site ${item.siteId}. Troque o site para aplicar.`, 'Publicacoes');
      return;
    }

    const validity = this.validateCategory(normalizedSiteId, item.categoryId);
    if (!validity.isValid) {
      this.toastr.warning('Essa sugestao nao corresponde ao site atual do anuncio.', 'Publicacoes');
      return;
    }

    this.debugWizardEvent('recent_categories_used', {
      categoryId: validity.normalizedCategoryId,
      siteId: normalizedSiteId,
      label: this.normalizeCategoryLabel(item.label)
    });
    this.onCategoryIdChanged(validity.normalizedCategoryId, 'recent', item.label);
  }

  onCategoryIdChanged(
    value: string,
    source: 'autofill_get' | 'manual_dropdown' | 'recent' | 'unknown' = 'unknown',
    displayLabel?: string | null
  ): void {
    const previous = this.state.categoryId.trim();
    const normalizedDisplayLabel = this.normalizeCategoryLabel(displayLabel);
    this.categoryIdInput = this.normalizeCategoryId(value);
    this.clearPublishInputInvalidState();
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.clearFeesInputInvalidState();
    this.refreshCategoryValidity(this.categoryIdInput);
    this.state.categoryId = this.categoryValidity.isValid ? this.categoryValidity.normalizedCategoryId : '';
    if (this.categoryValidity.isValid) {
      this.pendingCategoryClear = false;
      this.categoryResolutionBlockedByMl = false;
      this.categoryResolutionReason = null;
      this.categoryAutofilledFromGet = source === 'autofill_get';
      this.rememberCategoryLabel(this.state.categoryId, normalizedDisplayLabel);
      this.selectedCategoryLabel = normalizedDisplayLabel ?? this.resolveSelectedCategoryLabel(this.state.categoryId);
      if (this.categoryUpdateRequired) {
        this.categoryUpdateRequired = false;
        this.resetCategoryUpdateSuggestion();
      } else if (this.normalizeCategoryId(this.categoryUpdateSuggestionId ?? '') === this.normalizeCategoryId(this.state.categoryId)) {
        this.resetCategoryUpdateSuggestion();
      }
    } else {
      this.categoryAutofilledFromGet = false;
      this.selectedCategoryLabel = null;
    }
    this.closeCategorySelect(true);
    this.rebuildCategorySelectOptions();
    this.queueAutosave();
    this.queueEstimate();

    if (!this.categoryValidity.isValid) {
      this.clearCategoryCapabilityState();
      this.pauseAutoEstimateForInvalidCategory(this.categoryValidity, 'category_changed');
      return;
    }

    this.resumeAutoEstimate();
    if (previous !== this.state.categoryId) {
      this.clearCategoryCapabilityState();
      this.categoryAttributesUnavailable = false;
      this.categoryAttributesTraceId = null;
      this.showAttributesUnavailableBanner = false;
      this.categoryMlInvalid = false;
      this.categoryMlInvalidTraceId = null;
      this.categoryCapabilitiesLoad$.next();
    }
  }

  onSelectedVariantsChanged(value: string): void {
    this.state.selectedVariantSkus = (value ?? '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item, index, arr) => !!item && arr.indexOf(item) === index);
    this.queueAutosave();
  }

  onVariationAxesChanged(value: string): void {
    this.state.variationAxes = (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => !!item);
    this.queueAutosave();
  }

  addImage(urlInput: HTMLInputElement): void {
    const url = (urlInput.value ?? '').trim();
    if (!url) {
      return;
    }

    this.state.images = [...this.state.images, { url, position: this.state.images.length + 1 }];
    urlInput.value = '';
    this.queueAutosave();
  }

  moveImage(index: number, direction: 'up' | 'down'): void {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.state.images.length) {
      return;
    }

    const images = [...this.state.images];
    const current = images[index];
    images[index] = images[targetIndex];
    images[targetIndex] = current;
    this.state.images = images.map((item, idx) => ({ ...item, position: idx + 1 }));
    this.queueAutosave();
  }

  removeImage(index: number): void {
    this.state.images = this.state.images
      .filter((_, idx) => idx !== index)
      .map((item, idx) => ({ ...item, position: idx + 1 }));
    this.queueAutosave();
  }

  addAttribute(idInput: HTMLInputElement, valueInput: HTMLInputElement): void {
    const id = (idInput.value ?? '').trim();
    const value = (valueInput.value ?? '').trim();
    if (!id) {
      return;
    }

    this.state.attributes = [
      ...this.state.attributes,
      {
        id,
        valueName: value || null
      }
    ];
    idInput.value = '';
    valueInput.value = '';
    this.queueAutosave();
  }

  removeAttribute(index: number): void {
    this.state.attributes = this.state.attributes.filter((_, idx) => idx !== index);
    this.queueAutosave();
  }

  getAttributeDisplayValue(id: string): string {
    const item = this.state.attributes.find((attr) => attr.id.toUpperCase() === id.toUpperCase());
    if (!item) {
      return '';
    }

    return (item.valueName || item.valueId || '').trim();
  }

  getAttributeOptionValue(id: string): string {
    const item = this.state.attributes.find((attr) => attr.id.toUpperCase() === id.toUpperCase());
    return item?.valueId ?? '';
  }

  getAttributeBooleanValue(id: string): boolean {
    const item = this.state.attributes.find((attr) => attr.id.toUpperCase() === id.toUpperCase());
    if (!item) {
      return false;
    }

    const normalized = (item.valueName ?? item.valueId ?? '').toString().trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  updateRequiredAttribute(attribute: MarketplaceCategoryAttributeResult, rawValue: unknown): void {
    this.upsertCategoryAttribute(attribute, rawValue);
  }

  updateConditionalAttribute(attribute: MarketplaceCategoryAttributeResult, rawValue: unknown): void {
    this.updateOptionalAttribute(attribute, rawValue);
  }

  updateOptionalAttribute(attribute: MarketplaceCategoryAttributeResult, rawValue: unknown): void {
    this.upsertCategoryAttribute(attribute, rawValue);
  }

  getConditionalAttributeOptions(attribute: MarketplaceCategoryAttributeResult): MarketplaceCategoryAttributeValueResult[] {
    return this.getOptionalAttributeOptions(attribute);
  }

  getOptionalAttributeOptions(attribute: MarketplaceCategoryAttributeResult): MarketplaceCategoryAttributeValueResult[] {
    const normalizedAttributeId = this.normalizeCategoryId(attribute.id);
    return this.optionalAttributeOptionsById.get(normalizedAttributeId) ?? (attribute.values ?? []);
  }

  private upsertCategoryAttribute(attribute: MarketplaceCategoryAttributeResult, rawValue: unknown): void {
    const normalizedId = attribute.id.trim();
    if (!normalizedId) {
      return;
    }

    if (typeof rawValue === 'boolean') {
      if (!rawValue) {
        this.removeAttributeById(normalizedId);
        this.queueAutosave();
        return;
      }

      this.upsertAttributeValue(normalizedId, { id: normalizedId, valueName: 'true', valueId: null });
      this.queueAutosave();
      return;
    }

    const value = rawValue == null ? '' : String(rawValue).trim();
    if (!value) {
      this.removeAttributeById(normalizedId);
      this.queueAutosave();
      return;
    }

    const option = (attribute.values ?? []).find((item) => item.id === value);
    const nextValue: ListingDraftAttributeRequest = option
      ? { id: normalizedId, valueId: option.id, valueName: option.name }
      : { id: normalizedId, valueName: value, valueId: null };
    this.upsertAttributeValue(normalizedId, nextValue);
    this.queueAutosave();
  }

  private upsertAttributeValue(attributeId: string, nextValue: ListingDraftAttributeRequest): void {
    const index = this.state.attributes.findIndex((item) => item.id.toUpperCase() === attributeId.toUpperCase());
    if (index >= 0) {
      this.state.attributes = this.state.attributes.map((item, idx) => (idx === index ? nextValue : item));
      return;
    }

    this.state.attributes = [...this.state.attributes, nextValue];
  }

  private removeAttributeById(attributeId: string): void {
    this.state.attributes = this.state.attributes.filter((item) => item.id.toUpperCase() !== attributeId.toUpperCase());
  }

  loadCategoryCapabilities(force = false): void {
    const validity = this.refreshCategoryValidity(this.state.categoryId);
    if (!this.state.integrationId || !validity.isValid) {
      this.trackCategoryGuardSkip('category_attributes', validity);
      return;
    }

    const normalizedCategoryId = validity.normalizedCategoryId;
    const normalizedSiteId = validity.normalizedSiteId;
    const capabilitiesCacheKey = `${normalizedSiteId}|${normalizedCategoryId}`;

    if (!force && this.lastLoadedCategoryId && this.lastLoadedCategoryId === capabilitiesCacheKey) {
      return;
    }

    const requestSeq = ++this.categoryCapabilitiesRequestSeq;
    this.latestCategoryCapabilitiesRequestSeq = requestSeq;
    this.loadingCapabilities = true;
    this.publicationsService
      .getCategoryAttributes({
        channel: 'mercadolivre',
        integrationId: this.state.integrationId,
        sellerId: this.state.sellerId || null,
        siteId: normalizedSiteId,
        categoryId: normalizedCategoryId
      })
      .pipe(
        finalize(() => {
          if (requestSeq === this.latestCategoryCapabilitiesRequestSeq) {
            this.loadingCapabilities = false;
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          if (requestSeq !== this.latestCategoryCapabilitiesRequestSeq) {
            return;
          }

          this.categoryCapabilities = this.normalizeCategoryCapabilities(result);
          const preferredCategoryLabel = this.resolveSellerCategoryLabel(result.categoryName, result.categoryPathFromRoot);
          if (preferredCategoryLabel && normalizedCategoryId) {
            this.rememberCategoryLabel(normalizedCategoryId, preferredCategoryLabel);
            if (this.normalizeCategoryId(this.state.categoryId) === normalizedCategoryId) {
              this.selectedCategoryLabel = preferredCategoryLabel;
            }
          }
          this.rebuildOptionalCategoryAttributes();
          this.categoryAttributesUnavailable = false;
          this.categoryAttributesTraceId = null;
          this.showAttributesUnavailableBanner = false;
          this.categoryMlInvalid = false;
          this.categoryMlInvalidTraceId = null;
          this.resetAutoFailureState('attributes');
          this.upsertRecentCategory({
            sellerId: this.state.sellerId,
            siteId: normalizedSiteId,
            categoryId: normalizedCategoryId,
            label: this.selectedCategoryLabel ?? this.categorySuggestQuery?.trim() ?? null,
            lastUsedAt: Date.now()
          });
          this.lastLoadedCategoryId = capabilitiesCacheKey;
          this.queueAutosave();
          this.queueEstimate();
        },
        error: (error: HttpErrorResponse) => {
          if (requestSeq !== this.latestCategoryCapabilitiesRequestSeq) {
            return;
          }

          const code = this.extractApiCode(error);
          this.categoryCapabilities = null;
          this.rebuildOptionalCategoryAttributes();
          this.categoryAttributesTraceId = this.extractTraceId(error);
          this.categoryMlInvalidTraceId = this.categoryAttributesTraceId;

          if (error.status === 401 && code === 'ML_AUTH_INVALID') {
            this.mlAuthInvalid = true;
            this.categoryAttributesUnavailable = true;
            this.categoryMlInvalid = false;
            this.showAttributesUnavailableBanner = true;
            this.notifyAutomaticFailure('attributes', this.buildErrorMessage('Sessao ML invalida ao carregar atributos da categoria.', error), force);
            return;
          }

          if (error.status === 422 && code === 'ML_CATEGORY_INVALID') {
            this.categoryMlInvalid = true;
            this.categoryAttributesUnavailable = false;
            this.showAttributesUnavailableBanner = false;
            this.pauseAutoEstimateForInvalidCategory(validity, 'attributes_422');
            this.trackCategoryGuardSkip('category_attributes', validity);
            this.debugWizardEvent('category_attributes_expected_422', {
              traceId: this.categoryAttributesTraceId,
              siteId: normalizedSiteId,
              categoryId: normalizedCategoryId,
              fieldCategory: this.hasCategoryFieldValidationError(error)
            });
            return;
          }

          if (code === 'ML_UNAVAILABLE' || error.status === 503 || error.status >= 500 || error.status === 0) {
            this.categoryMlInvalid = false;
            this.categoryAttributesUnavailable = true;
            this.notifyAutomaticFailure(
              'attributes',
              this.buildErrorMessage('Atributos da categoria indisponiveis no momento.', error),
              force);
            return;
          }

          this.categoryMlInvalid = false;
          this.categoryAttributesUnavailable = false;
          this.showAttributesUnavailableBanner = false;
          this.toastr.danger(this.buildErrorMessage('Falha ao carregar atributos da categoria.', error), 'Publicacoes');
        }
      });
  }

  estimateFees(options?: { manual?: boolean }): void {
    const manual = options?.manual ?? false;
    const validity = this.refreshCategoryValidity(this.state.categoryId);
    if (!this.state.integrationId || !this.state.listingTypeId.trim() || !validity.isValid || this.priceInputInvalid || !this.state.price || this.state.price <= 0) {
      this.trackCategoryGuardSkip('fees_estimate', validity);
      if (manual) {
        this.toastr.warning(this.estimateBlockingMessage, 'Publicacoes');
      }
      return;
    }

    const estimateInputKey = this.buildEstimateInputKey(validity);
    this.loadingEstimate = true;
    this.publicationsService
      .estimateFees({
        channel: 'mercadolivre',
        integrationId: this.state.integrationId,
        sellerId: this.state.sellerId || null,
        siteId: validity.normalizedSiteId,
        categoryId: validity.normalizedCategoryId,
        listingTypeId: this.state.listingTypeId,
        price: this.state.price,
        currencyId: this.state.currencyId,
        productCost: this.effectiveProductCost,
        operationalCost: this.state.operationalCost
      })
      .pipe(
        finalize(() => (this.loadingEstimate = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.estimate = result;
          this.mlAuthInvalid = false;
          this.clearAutoEstimateRetryTimer();
          this.autoEstimateRetryKey = null;
          this.autoEstimatePaused = false;
          this.autoEstimatePauseReason = null;
          this.autoEstimatePausedKey = null;
          this.clearFeesInputInvalidState();
          this.feesEstimateTraceId = null;
          this.feesEstimateDegraded = false;
          this.showFeesUnavailableBanner = false;
          this.resetAutoFailureState('fees');
        },
        error: (error: HttpErrorResponse) => {
          const code = this.extractApiCode(error);
          this.feesEstimateTraceId = this.extractTraceId(error);
          if (error.status === 401 && code === 'ML_AUTH_INVALID') {
            this.mlAuthInvalid = true;
            this.clearAutoEstimateRetryTimer();
            this.autoEstimateRetryKey = null;
            this.autoEstimatePaused = false;
            this.autoEstimatePauseReason = null;
            this.autoEstimatePausedKey = null;
            this.notifyAutomaticFailure('fees', this.buildErrorMessage('Sessao ML invalida ao estimar taxas. Reconecte a integracao.', error), manual);
            return;
          }

          if (error.status === 422 && code === 'ML_FEES_INPUT_INVALID') {
            const categoryFieldError = this.hasCategoryFieldValidationError(error);
            this.clearAutoEstimateRetryTimer();
            this.autoEstimateRetryKey = null;
            this.autoEstimatePaused = categoryFieldError;
            this.autoEstimatePauseReason = categoryFieldError ? 'category_invalid' : null;
            this.autoEstimatePausedKey = categoryFieldError ? estimateInputKey : null;
            this.feesInputInvalid = true;
            this.feesInputInvalidTraceId = this.extractTraceId(error);
            this.feesEstimateDegraded = false;
            this.showFeesUnavailableBanner = false;
            this.trackCategoryGuardSkip('fees_estimate', validity);
            this.debugWizardEvent('fees_estimate_expected_422', {
              traceId: this.feesInputInvalidTraceId,
              siteId: validity.normalizedSiteId,
              categoryId: validity.normalizedCategoryId,
              fieldCategory: categoryFieldError
            });
            return;
          }

          if (code === 'ML_UNAVAILABLE' || error.status === 503 || error.status >= 500 || error.status === 0) {
            this.estimate = null;
            this.feesEstimateDegraded = true;
            this.autoEstimatePaused = true;
            this.autoEstimatePauseReason = 'unavailable';
            this.autoEstimatePausedKey = estimateInputKey;
            this.showFeesUnavailableBanner = true;
            this.clearAutoEstimateRetryTimer();
            this.autoEstimateRetryKey = null;
            this.notifyAutomaticFailure('fees', this.buildErrorMessage('Taxa indisponivel no ML. Tente novamente em instantes.', error), manual);
            return;
          }

          this.toastr.danger(this.buildErrorMessage('Falha ao estimar taxas.', error), 'Publicacoes');
        }
      });
  }

  validateDraft(): void {
    if (this.missingVariantBlocked) {
      return;
    }

    if (!this.draftId) {
      this.toastr.warning('Salve o draft antes de validar.', 'Publicacoes');
      return;
    }

    this.validating = true;
    this.publicationsService
      .validateDraft(this.draftId)
      .pipe(
        finalize(() => (this.validating = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.issues = result.issues ?? [];
          if (result.rowVersion?.trim()) {
            this.rowVersion = result.rowVersion.trim();
          }
          if (result.status?.trim()) {
            this.draftStatus = result.status.trim();
          }

          if (result.isValid) {
            this.lastValidationIsValid = true;
            this.lastValidatedRowVersion = this.rowVersion;
            this.toastr.success('Draft validado sem bloqueios.', 'Publicacoes');
          } else {
            this.lastValidationIsValid = false;
            this.lastValidatedRowVersion = null;
            this.toastr.warning(`Foram encontrados ${this.issues.length} problemas no draft.`, 'Publicacoes');
          }
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao validar draft.', error), 'Publicacoes');
        }
      });
  }

  publishDraft(): void {
    if (this.missingVariantBlocked) {
      return;
    }

    if (!this.draftId || !this.rowVersion) {
      this.toastr.warning('Draft ou versao ausente.', 'Publicacoes');
      return;
    }

    this.publishing = true;
    this.publicationsService
      .publishDraft(this.draftId, this.rowVersion)
      .pipe(
        finalize(() => (this.publishing = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.rowVersion = result.rowVersion;
          this.draftStatus = result.status || this.draftStatus;
          this.lastValidationIsValid = false;
          this.lastValidatedRowVersion = null;
          this.lastPublishResult = result;
          this.toastr.success('Publicacao processada com sucesso.', 'Publicacoes');
          if (result.publishedPermalink) {
            window.open(result.publishedPermalink, '_blank', 'noopener');
          }
        },
        error: (error: HttpErrorResponse) => {
          const code = (error.error?.code ?? '').toString();
          const normalizedCode = code.trim().toUpperCase();
          if (error.status === 422 && code === 'DRAFT_NOT_VALIDATED') {
            this.toastr.warning('Execute Validar antes de Publicar.', 'Publicacoes');
            this.lastValidationIsValid = false;
            this.lastValidatedRowVersion = null;
            return;
          }

          if (error.status === 422 && normalizedCode === 'ML_PUBLISH_INPUT_INVALID') {
            this.publishInputInvalid = true;
            this.lastValidationIsValid = false;
            this.lastValidatedRowVersion = null;
            this.goToStepById('category');
            this.toastr.warning(this.buildErrorMessage('Mercado Livre rejeitou o payload. Revise categoria, atributos e fiscal.', error), 'Publicacoes');
            return;
          }

          if (error.status === 401 && normalizedCode === 'ML_AUTH_INVALID') {
            this.mlAuthInvalid = true;
            this.toastr.warning(this.buildErrorMessage('Sessao ML invalida. Reconecte a integracao.', error), 'Publicacoes');
            return;
          }

          if (error.status === 503 || normalizedCode === 'ML_UNAVAILABLE') {
            this.toastr.warning(this.buildErrorMessage('Mercado Livre indisponivel no momento. Tente novamente.', error), 'Publicacoes');
            return;
          }

          if (error.status === 409 && code === 'DRAFT_CONCURRENCY_CONFLICT') {
            this.toastr.warning('Conflito de versao detectado. Recarregando draft...', 'Publicacoes');
            this.reloadCurrentDraft();
            return;
          }

          this.toastr.danger(this.buildErrorMessage('Falha ao publicar draft.', error), 'Publicacoes');
        }
      });
  }

  goToPublications(): void {
    void this.router.navigate(['/client/publications']);
  }

  goToMyProducts(): void {
    void this.router.navigate(['/client/my-products']);
  }

  retryMissingVariant(): void {
    this.reloadCurrentDraft();
  }

  goToMercadoLivreIntegration(): void {
    void this.router.navigate(['/client/integrations/mercadolivre']);
  }

  private loadContext(): void {
    this.loading = true;
    this.errorMessage = null;
    this.clearMissingVariantBlock();
    this.mlAuthInvalid = false;
    this.categorySuggestDegraded = false;
    this.categorySuggestReason = null;
    this.categorySuggestTraceId = null;
    this.categorySuggestions = [];
    this.categoryCapabilities = null;
    this.rebuildOptionalCategoryAttributes();
    this.categorySelectOptionsState = [];
    this.categorySelectGroupsState = [];
    this.categorySelectFilteredOptionsState = [];
    this.categorySelectFilterQuery = '';
    this.categorySelectOpen = false;
    this.categorySelectActiveIndex = -1;
    this.lastCategoryOptionsKey = '';
    this.autoSelectedCategoryKeys.clear();
    this.resetSuggestRetryState();
    this.recentCategories = [];
    this.feesEstimateDegraded = false;
    this.feesEstimateTraceId = null;
    this.showFeesUnavailableBanner = false;
    this.clearFeesInputInvalidState();
    this.autoEstimatePaused = false;
    this.autoEstimatePauseReason = null;
    this.autoEstimatePausedKey = null;
    this.autoEstimateRetryKey = null;
    this.clearAutoEstimateRetryTimer();
    this.categoryAttributesUnavailable = false;
    this.categoryAttributesTraceId = null;
    this.showAttributesUnavailableBanner = false;
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.publishInputInvalid = false;
    this.lastLoadedCategoryId = null;
    this.state.siteId = this.normalizeSiteId(this.state.siteId);
    this.state.categoryId = '';
    this.salePriceInput = '';
    this.priceInputInvalid = false;
    this.categoryIdInput = '';
    this.refreshCategoryValidity(this.categoryIdInput);
    this.draftStatus = 'Draft';
    this.lastValidatedRowVersion = null;
    this.lastValidationIsValid = false;
    this.resetAutoFailureState('fees');
    this.resetAutoFailureState('attributes');
    this.resetAutoFailureState('suggest');
    this.pendingCategoryClear = false;
    this.categoryResolutionReason = null;
    this.categoryResolutionBlockedByMl = false;
    this.showTechnicalDetails = false;
    this.rebuildCategorySelectOptions();
    this.routerPrefill = this.readRouterPrefill();
    this.prefillOrigins = {};
    const routeDraftId = (this.route.snapshot.paramMap.get('draftId') ?? '').trim();
    const queryVariantSku = (this.route.snapshot.queryParamMap.get('variantSku') ?? '').trim();
    const querySellerId = (this.route.snapshot.queryParamMap.get('sellerId') ?? '').trim();
    const queryChannel = (this.route.snapshot.queryParamMap.get('channel') ?? '').trim().toLowerCase();
    if (queryChannel) {
      this.state.channel = queryChannel;
    }

    this.integrationService
      .status()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.sellers = status.connections ?? [];
          if (querySellerId && this.sellers.some((item) => item.sellerId === querySellerId)) {
            this.state.sellerId = querySellerId;
          } else if (this.sellers.length > 0) {
            this.state.sellerId = this.sellers[0].sellerId;
          }

          const selected = this.sellers.find((item) => item.sellerId === this.state.sellerId);
          this.state.integrationId = selected?.integrationId ?? '';
          this.refreshRecentCategories();

          if (routeDraftId) {
            this.loadByDraftId(routeDraftId);
            return;
          }

          if (queryVariantSku) {
            this.state.variantSku = queryVariantSku.toUpperCase();
            this.loadByVariantSku();
            return;
          } else if ((this.routerPrefill?.variantSku ?? '').trim()) {
            this.state.variantSku = (this.routerPrefill?.variantSku ?? '').trim().toUpperCase();
            this.loadByVariantSku();
            return;
          }

          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar contexto do wizard.', error);
        }
      });
  }

  private loadByDraftId(draftId: string): void {
    this.publicationsService
      .queryPublications({
        channel: 'mercadolivre',
        search: draftId,
        skip: 0,
        limit: 1
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const match = (result.items ?? []).find((item) => item.draftId === draftId) ?? result.items?.[0];
          if (!match) {
            this.loading = false;
            this.errorMessage = 'Draft nao encontrado.';
            return;
          }

          this.state.variantSku = match.sabrVariantSku;
          this.state.sellerId = match.sellerId;
          this.state.integrationId = match.integrationId;
          this.loadByVariantSku();
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar draft.', error);
        }
      });
  }

  private loadByVariantSku(): void {
    const normalizedSku = (this.state.variantSku ?? '').trim().toUpperCase();
    if (!normalizedSku) {
      this.loading = false;
      return;
    }

    this.state.variantSku = normalizedSku;
    this.variantSelection$.next(normalizedSku);
  }

  private fetchDraftForVariant(variantSku: string): void {
    const requestedVariantSku = (variantSku ?? '').trim().toUpperCase();
    if (!requestedVariantSku) {
      this.loading = false;
      return;
    }

    this.publicationsService
      .getDraft({
        variantSku: requestedVariantSku,
        channel: this.state.channel,
        sellerId: this.state.sellerId || null,
        integrationId: this.state.integrationId || null
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: ListingDraftGetResult) => {
          this.candidateVariants = result.candidates ?? [];
          this.variantCandidates = this.candidateVariants.map((item) => item.sabrVariantSku);
          const effectiveVariantSku = ((result.resolvedVariantSku ?? requestedVariantSku) || '').trim().toUpperCase();
          if (effectiveVariantSku) {
            this.state.variantSku = effectiveVariantSku;
          }
          if (this.state.selectedVariantSkus.length === 0 && effectiveVariantSku) {
            this.state.selectedVariantSkus = [effectiveVariantSku];
          }

          let shouldPersistPrefill = false;
          if (result.draft) {
            shouldPersistPrefill = this.applyDraft(result.draft) || shouldPersistPrefill;
          } else {
            this.draftStatus = 'Draft';
            this.lastValidatedRowVersion = null;
            this.lastValidationIsValid = false;
          }

          this.categoryAutofilledFromGet = false;
          this.refreshRecentCategories();
          this.mergeCategorySuggestionsFromGet(result.categorySuggestions);

          const suggestedCategoryId = this.normalizeCategoryId(result.suggestedCategoryId || '');
          const suggestedCategoryLabel = this.normalizeCategoryLabel(result.suggestedCategoryPath ?? null);
          const resolutionStatus = (result.categoryResolutionStatus ?? '').toString().trim();
          const resolutionReason = (result.categoryResolutionReason ?? '').toString().trim().toUpperCase();
          this.categoryResolutionReason = resolutionReason || null;
          this.categoryResolutionBlockedByMl = resolutionReason === 'ML_UNAVAILABLE' || resolutionReason === 'ML_AUTH_INVALID';
          if (resolutionReason === 'ML_AUTH_INVALID') {
            this.mlAuthInvalid = true;
          }
          if (result.categoryLockAvailable === false) {
            this.debugWizardEvent('category_lock_unavailable', {
              variantSku: requestedVariantSku,
              source: result.suggestedCategorySource ?? null,
              status: resolutionStatus || null
            });
          }
          const isReviewRequired = resolutionStatus === 'ReviewRequired';
          const isSelectionRequired =
            !!result.categorySelectionRequired || isReviewRequired || resolutionStatus === 'SelectionRequired';
          const canAutoApplySuggested = !isSelectionRequired;

          if (isReviewRequired) {
            this.debugWizardEvent('wizard_category_review_required', {
              variantSku: requestedVariantSku,
              currentCategoryId: this.normalizeCategoryId(this.state.categoryId),
              suggestedCategoryId,
              reason: this.categoryResolutionReason
            });
          }

          if (this.categoryResolutionBlockedByMl) {
            this.categoryAutofilledFromGet = false;
            this.categoryUpdateRequired = false;
            this.resetCategoryUpdateSuggestion();
            this.rebuildCategorySelectOptions();
            this.debugWizardEvent('category_manual_fallback_active', {
              variantSku: requestedVariantSku,
              reason: this.categoryResolutionReason,
              suggestions: this.categorySuggestions.length,
              hasSelectedCategory: !!this.state.categoryId.trim()
            });
          } else if (!this.state.categoryId.trim() && suggestedCategoryId && canAutoApplySuggested) {
            this.debugWizardEvent('category_autofill_suggested_from_get', {
              suggestedCategoryId,
              source: result.suggestedCategorySource ?? null,
              path: result.suggestedCategoryPath ?? null,
              displayLabelApplied: suggestedCategoryLabel,
              hasDraft: !!result.draft
            });
            this.onCategoryIdChanged(suggestedCategoryId, 'autofill_get', suggestedCategoryLabel);
            shouldPersistPrefill = true;
            this.categoryUpdateRequired = false;
          } else if (suggestedCategoryId && this.state.categoryId.trim()) {
            shouldPersistPrefill =
              this.evaluateCategoryUpdateSuggestion(suggestedCategoryId, suggestedCategoryLabel, result.suggestedCategorySource ?? null) ||
              shouldPersistPrefill;
          } else if (suggestedCategoryId && isSelectionRequired) {
            this.categoryUpdateRequired = true;
            this.showCategoryUpdateSuggestion = true;
            this.categoryUpdateSuggestionId = suggestedCategoryId;
            this.categoryUpdateSuggestionLabel = suggestedCategoryLabel ?? 'Categoria recomendada disponivel';
            this.pendingCategoryClear = true;
            this.rebuildCategorySelectOptions();
            shouldPersistPrefill = true;
          } else if (isSelectionRequired && !this.state.categoryId.trim()) {
            this.categoryUpdateRequired = true;
            this.showCategoryUpdateSuggestion = true;
            this.categoryUpdateSuggestionId = null;
            this.categoryUpdateSuggestionLabel = 'Escolha uma categoria para continuar.';
            this.pendingCategoryClear = true;
            this.rebuildCategorySelectOptions();
            shouldPersistPrefill = true;
          } else {
            this.categoryUpdateRequired = false;
            this.resetCategoryUpdateSuggestion();
          }

          shouldPersistPrefill = this.applyRouterStateFallback() || shouldPersistPrefill;
          this.loadFallbackFromMyProductsIfNeeded((fallbackChanged) => {
            shouldPersistPrefill = fallbackChanged || shouldPersistPrefill;
            shouldPersistPrefill = this.mergeDraftWithSnapshot(this.snapshot) || shouldPersistPrefill;

            if (!result.draft || shouldPersistPrefill) {
              this.queueAutosave();
            }

            if (result.draft && this.categoryValidity.isValid) {
              this.categoryCapabilitiesLoad$.next();
            }

            this.autoSuggestCategoryIfNeeded();
            this.queueEstimate();
            this.loading = false;
          });
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          if (this.isSkuNotFoundError(error)) {
            this.setMissingVariantBlock();
            return;
          }

          this.errorMessage = this.buildErrorMessage('Falha ao carregar draft por SKU.', error);
        }
      });
  }
  private reloadCurrentDraft(): void {
    if (!this.state.variantSku) {
      return;
    }

    this.loading = true;
    this.loadByVariantSku();
  }

  private mergeCategorySuggestionsFromGet(options?: CategorySuggestionOptionResult[] | null): void {
    const incoming = (options ?? [])
      .map((item) => {
        const categoryId = this.normalizeCategoryId(item?.categoryId);
        if (!categoryId) {
          return null;
        }

        const categoryName = this.normalizeCategoryLabel(item?.categoryName ?? null);
        const pathFromRoot = this.normalizeCategoryLabel(item?.categoryPathFromRoot ?? null);
        const label = this.resolveSellerCategoryLabel(categoryName, pathFromRoot);
        if (label) {
          this.rememberCategoryLabel(categoryId, label);
        }

        return {
          categoryId,
          categoryName: categoryName ?? label ?? '',
          pathFromRoot: pathFromRoot ?? label ?? categoryName ?? null,
          source: item?.source ?? null
        } as MarketplaceCategorySuggestItemResult;
      })
      .filter((item): item is MarketplaceCategorySuggestItemResult => !!item);

    if (incoming.length === 0) {
      return;
    }

    const byCategoryId = new Map<string, MarketplaceCategorySuggestItemResult>();
    for (const item of incoming) {
      byCategoryId.set(this.normalizeCategoryId(item.categoryId), item);
    }

    for (const item of this.categorySuggestions) {
      const categoryId = this.normalizeCategoryId(item.categoryId);
      if (!categoryId || byCategoryId.has(categoryId)) {
        continue;
      }

      byCategoryId.set(categoryId, item);
    }

    this.categorySuggestions = Array.from(byCategoryId.values());
    this.rebuildCategorySelectOptions();
  }

  private applyDraft(draft: ListingDraftResult): boolean {
    let shouldPersistInvalidCategoryClear = false;
    this.draftId = draft.draftId;
    this.rowVersion = draft.rowVersion;
    this.draftStatus = draft.status || 'Draft';
    this.lastValidatedRowVersion = this.draftStatus === 'Valid' ? this.rowVersion : null;
    this.lastValidationIsValid = this.draftStatus === 'Valid';
    this.state.channel = draft.channel || 'mercadolivre';
    this.state.integrationId = draft.integrationId;
    this.state.sellerId = draft.sellerId;
    this.state.siteId = this.normalizeSiteId(draft.siteId || 'MLB');
    this.state.variantSku = draft.sabrVariantSku;
    const normalizedDraftCategoryId = this.normalizeCategoryId(draft.categoryId || '');
    const draftCategoryValidity = this.validateCategory(this.state.siteId, normalizedDraftCategoryId);
    if (draftCategoryValidity.isValid) {
      this.categoryIdInput = draftCategoryValidity.normalizedCategoryId;
      this.refreshCategoryValidity(this.categoryIdInput);
      this.state.categoryId = this.categoryValidity.normalizedCategoryId;
      this.pendingCategoryClear = false;
    } else {
      this.categoryIdInput = '';
      this.refreshCategoryValidity(this.categoryIdInput);
      this.state.categoryId = '';
      if (normalizedDraftCategoryId) {
        this.pendingCategoryClear = true;
        shouldPersistInvalidCategoryClear = true;
        this.debugWizardEvent('draft_category_invalid_legacy_detected', {
          siteId: this.normalizeSiteId(this.state.siteId),
          categoryId: normalizedDraftCategoryId
        });
      } else {
        this.pendingCategoryClear = false;
      }
      this.selectedCategoryLabel = null;
    }
    this.state.listingTypeId = draft.listingTypeId || 'gold_special';
    this.state.condition = draft.condition || 'new';
    this.state.title = draft.title || '';
    this.state.description = draft.description || '';
    this.state.price = draft.price ?? null;
    this.syncSalePriceInputFromState();
    this.priceInputInvalid = false;
    this.state.productCost = this.state.productCost ?? null;
    this.state.operationalCost = this.state.operationalCost ?? null;
    this.state.currencyId = draft.currencyId || 'BRL';
    this.state.gtin = draft.gtin || '';
    this.state.emptyGtinReason = draft.emptyGtinReason || '';
    if (this.state.gtin.trim() && this.state.emptyGtinReason.trim()) {
      this.state.emptyGtinReason = '';
    }
    this.state.ncm = draft.ncm || '';
    this.state.origin = draft.origin || '';
    this.state.images = [...(draft.images ?? [])].sort((a, b) => a.position - b.position);
    this.state.attributes = [...(draft.attributes ?? [])];
    this.state.selectedVariantSkus = draft.sabrVariantSku ? [draft.sabrVariantSku] : this.state.selectedVariantSkus;
    this.refreshRecentCategories();
    this.selectedCategoryLabel = this.state.categoryId ? this.resolveSelectedCategoryLabel(this.state.categoryId) : null;
    this.rebuildCategorySelectOptions();
    return shouldPersistInvalidCategoryClear;
  }

  private evaluateCategoryUpdateSuggestion(
    suggestedCategoryId: string,
    suggestedCategoryLabel: string | null,
    suggestedCategorySource: string | null
  ): boolean {
    const normalizedSuggestedId = this.normalizeCategoryId(suggestedCategoryId);
    const normalizedCurrentId = this.normalizeCategoryId(this.state.categoryId);
    if (!normalizedSuggestedId || !normalizedCurrentId || normalizedSuggestedId === normalizedCurrentId) {
      this.categoryUpdateRequired = false;
      this.resetCategoryUpdateSuggestion();
      return false;
    }

    const effectiveLabel =
      this.normalizeCategoryLabel(suggestedCategoryLabel) ??
      this.resolveSelectedCategoryLabel(normalizedSuggestedId) ??
      'Categoria recomendada atualizada';
    this.rememberCategoryLabel(normalizedSuggestedId, effectiveLabel);

    const hadCategoryValue = !!this.state.categoryId.trim() || !!this.categoryIdInput.trim();
    this.categoryUpdateSuggestionId = normalizedSuggestedId;
    this.categoryUpdateSuggestionLabel = effectiveLabel;
    this.showCategoryUpdateSuggestion = true;
    this.categoryUpdateRequired = true;

    // Anti-stale policy: remove outdated draft category and force a fresh selection.
    this.categoryIdInput = '';
    this.state.categoryId = '';
    this.refreshCategoryValidity(this.categoryIdInput);
    this.clearPublishInputInvalidState();
    this.categoryMlInvalid = false;
    this.categoryMlInvalidTraceId = null;
    this.clearFeesInputInvalidState();
    this.clearCategoryCapabilityState();
    this.categoryAutofilledFromGet = false;
    this.selectedCategoryLabel = null;
    this.pendingCategoryClear = true;
    this.closeCategorySelect(true);
    this.rebuildCategorySelectOptions();

    this.debugWizardEvent('category_update_suggestion_available', {
      currentCategoryId: normalizedCurrentId,
      suggestedCategoryId: normalizedSuggestedId,
      suggestedCategoryLabel: effectiveLabel,
      source: suggestedCategorySource
    });
    return hadCategoryValue;
  }

  private resetCategoryUpdateSuggestion(): void {
    this.categoryUpdateSuggestionId = null;
    this.categoryUpdateSuggestionLabel = null;
    this.showCategoryUpdateSuggestion = false;
  }

  private applyRouterStateFallback(): boolean {
    const state = this.routerPrefill;
    if (!state) {
      return false;
    }

    this.prefillHydrating = true;
    let changed = false;
    changed = this.setIfBlankFromSource('title', this.state.title, state.titleSuggestion, 'routerState') || changed;
    changed = this.setIfBlankFromSource('description', this.state.description, state.description, 'routerState') || changed;
    changed = this.setIfBlankFromSource('gtin', this.state.gtin, state.gtin, 'routerState') || changed;
    changed = this.setIfBlankFromSource('ncm', this.state.ncm, state.ncm, 'routerState') || changed;
    changed = this.setIfBlankFromSource('origin', this.state.origin, state.origin, 'routerState') || changed;

    if (this.state.productCost == null && typeof state.catalogPrice === 'number' && Number.isFinite(state.catalogPrice)) {
      const normalized = this.normalizePrefillMoney(state.catalogPrice, 'routerState', 'catalogPrice', state.catalogPriceScale ?? null, true);
      if (typeof normalized === 'number' && Number.isFinite(normalized)) {
        this.state.productCost = normalized;
        this.prefillOrigins.productCost = 'routerState';
        changed = true;
      }
    }

    if (this.state.images.length === 0 && (state.images?.length ?? 0) > 0) {
      this.state.images = (state.images ?? [])
        .filter((item) => !!item.url?.trim())
        .map((item, index) => ({
          url: item.url.trim(),
          position: index + 1
        }));
      this.prefillOrigins.images = 'routerState';
      changed = this.state.images.length > 0 || changed;
    }

    this.prefillHydrating = false;
    return changed;
  }

  private loadFallbackFromMyProductsIfNeeded(onDone: (changed: boolean) => void): void {
    const needsFallback = !this.state.description.trim() ||
      !this.state.gtin.trim() ||
      !this.state.ncm.trim() ||
      !this.state.origin.trim() ||
      this.state.images.length === 0 ||
      this.state.productCost == null;

    if (!needsFallback || !this.state.variantSku) {
      onDone(false);
      return;
    }

    this.myProductsService
      .listMyProducts({
        skip: 0,
        limit: 1,
        variantSku: this.state.variantSku
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const items = result.items ?? [];
          const currentSku = this.state.variantSku.trim().toUpperCase();
          let item = items.find((candidate) =>
            (candidate.productSku ?? '').trim().toUpperCase() === currentSku) ?? null;
          if (!item && currentSku && items.length === 1) {
            item = items[0];
          }
          if (!item) {
            onDone(false);
            return;
          }

          onDone(this.applyMyProductsFallback(item));
        },
        error: () => {
          onDone(false);
        }
      });
  }

  private applyMyProductsFallback(item: MyProductDraft): boolean {
    this.prefillHydrating = true;
    let changed = false;
    changed = this.setIfBlankFromSource('description', this.state.description, item.description, 'myProducts') || changed;
    changed = this.setIfBlankFromSource('gtin', this.state.gtin, item.gtin, 'myProducts') || changed;
    changed = this.setIfBlankFromSource('ncm', this.state.ncm, item.ncm, 'myProducts') || changed;
    changed = this.setIfBlankFromSource('origin', this.state.origin, item.origin, 'myProducts') || changed;

    if (this.state.productCost == null && typeof item.catalogPrice === 'number' && Number.isFinite(item.catalogPrice)) {
      const normalized = this.normalizePrefillMoney(item.catalogPrice, 'myProducts', 'catalogPrice', 'brl', true);
      if (typeof normalized === 'number' && Number.isFinite(normalized)) {
        this.state.productCost = normalized;
        this.prefillOrigins.productCost = 'myProducts';
        changed = true;
      }
    }

    if (this.state.images.length === 0 && (item.images?.length ?? 0) > 0) {
      this.state.images = (item.images ?? [])
        .filter((image) => !!image.url?.trim())
        .map((image, index) => ({
          url: image.url.trim(),
          position: index + 1
        }));
      this.prefillOrigins.images = 'myProducts';
      changed = this.state.images.length > 0 || changed;
    }

    this.prefillHydrating = false;
    return changed;
  }

  private mergeDraftWithSnapshot(snapshot: CatalogVariantSnapshotResult | null): boolean {
    if (!snapshot) {
      return false;
    }

    this.prefillHydrating = true;
    let changed = false;
    if (!this.state.siteId.trim() && snapshot.siteId?.trim()) {
      this.state.siteId = snapshot.siteId.trim();
      changed = true;
    }

    if (!this.state.currencyId.trim() && snapshot.currencyId?.trim()) {
      this.state.currencyId = snapshot.currencyId.trim();
      changed = true;
    }

    if (!this.state.listingTypeId.trim() && snapshot.listingTypeDefault?.trim()) {
      this.state.listingTypeId = snapshot.listingTypeDefault.trim();
      changed = true;
    }

    if (
      (!this.state.price || this.state.price <= 0) &&
      typeof snapshot.catalogPrice === 'number' &&
      Number.isFinite(snapshot.catalogPrice) &&
      snapshot.catalogPrice > 0
    ) {
      this.state.price = this.roundMoneyValue(snapshot.catalogPrice);
      this.syncSalePriceInputFromState();
      this.priceInputInvalid = false;
      changed = true;
    }

    if (
      this.state.productCost == null &&
      typeof snapshot.catalogPrice === 'number' &&
      Number.isFinite(snapshot.catalogPrice) &&
      snapshot.catalogPrice > 0
    ) {
      const normalized = this.normalizePrefillMoney(snapshot.catalogPrice, 'snapshot', 'catalogPrice', 'brl', false);
      if (typeof normalized === 'number' && Number.isFinite(normalized)) {
        this.state.productCost = normalized;
        this.prefillOrigins.productCost = 'snapshot';
        changed = true;
      }
    } else if (this.state.productCost == null) {
      this.debugWizardEvent('catalog_price_missing_for_product_cost', {
        variantSku: this.state.variantSku,
        snapshotVariantSku: snapshot.variantSku,
        resolvedVariantSku: snapshot.resolvedVariantSku ?? null,
        baseSku: snapshot.baseSku,
        catalogPrice: snapshot.catalogPrice ?? null
      });
    }

    changed = this.setIfBlankFromSource('title', this.state.title, snapshot.title, 'snapshot') || changed;
    changed = this.setIfBlankFromSource('description', this.state.description, snapshot.description, 'snapshot') || changed;
    changed = this.setIfBlankFromSource('gtin', this.state.gtin, snapshot.gtin, 'snapshot') || changed;
    changed = this.setIfBlankFromSource('ncm', this.state.ncm, snapshot.ncm, 'snapshot') || changed;
    changed = this.setIfBlankFromSource('origin', this.state.origin, snapshot.origin, 'snapshot') || changed;

    if (this.state.images.length === 0 && (snapshot.images?.length ?? 0) > 0) {
      this.state.images = (snapshot.images ?? [])
        .filter((item) => !!item.url?.trim())
        .map((item, index) => ({
          url: item.url.trim(),
          position: index + 1
        }));
      this.prefillOrigins.images = 'snapshot';
      changed = this.state.images.length > 0 || changed;
    }
    this.prefillHydrating = false;
    return changed;
  }

  private setIfBlank(field: 'title' | 'description' | 'gtin' | 'ncm' | 'origin', currentValue: string, fallbackValue?: string | null): boolean {
    return this.setIfBlankFromSource(field, currentValue, fallbackValue);
  }

  private setIfBlankFromSource(
    field: PrefillField,
    currentValue: string,
    fallbackValue?: string | null,
    source?: string
  ): boolean {
    if (currentValue.trim()) {
      return false;
    }

    const normalized = (fallbackValue ?? '').trim();
    if (!normalized) {
      return false;
    }

    this.state[field] = normalized;
    if (source) {
      this.prefillOrigins[field] = source;
    }
    if (field === 'gtin' && this.state.gtin.trim() && this.state.emptyGtinReason.trim()) {
      this.state.emptyGtinReason = '';
    }
    return true;
  }

  private autoSuggestCategoryIfNeeded(): void {
    if (this.mlAuthInvalid) {
      return;
    }

    const query = (this.state.title || this.displayProductName || this.state.variantSku).trim();
    if (query.length < 3) {
      return;
    }

    this.categorySuggestQuery = query;
    this.categorySuggest$.next(query);
  }

  private fetchCategorySuggestions(rawQuery: string, manual = false, fromRetry = false): void {
    const query = (rawQuery ?? '').trim();
    if (query.length < 3) {
      this.categorySuggestions = [];
      this.rebuildCategorySelectOptions();
      this.resetSuggestRetryState();
      return;
    }

    if (!query || !this.state.sellerId) {
      this.categorySuggestions = [];
      this.rebuildCategorySelectOptions();
      this.resetSuggestRetryState();
      return;
    }

    if (this.mlAuthInvalid && !manual) {
      return;
    }

    if (this.suggestAutoPaused && !manual && !fromRetry) {
      return;
    }

    this.loadingCategorySuggest = true;
    this.publicationsService
      .suggestCategories({
        channel: 'mercadolivre',
        sellerId: this.state.sellerId,
        siteId: this.normalizeSiteId(this.state.siteId),
        query
      })
      .pipe(
        finalize(() => (this.loadingCategorySuggest = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.mlAuthInvalid = result.reason === 'ML_AUTH_INVALID';
          this.categorySuggestDegraded = !!result.degraded;
          this.categorySuggestReason = result.reason ?? null;
          this.categorySuggestTraceId = result.traceId ?? null;
          this.categorySuggestions = result.items ?? [];
          this.rebuildCategorySelectOptions();

          if (result.degraded) {
            this.debugWizardEvent('suggest_degraded_received', {
              traceId: result.traceId ?? null,
              reason: result.reason ?? 'ML_UNAVAILABLE',
              sellerId: this.state.sellerId,
              siteId: this.normalizeSiteId(this.state.siteId),
              query,
              source: fromRetry ? 'retry' : (manual ? 'manual' : 'auto')
            });

            if ((result.items?.length ?? 0) > 0 && result.items?.some((item) => item?.source === 'lock_cache')) {
              this.debugWizardEvent('category_manual_fallback_active', {
                reason: result.reason ?? 'ML_UNAVAILABLE',
                query,
                suggestions: result.items?.length ?? 0,
                source: 'lock_cache'
              });
            }

            const shouldScheduleRetry =
              !this.state.categoryId.trim() &&
              this.categorySuggestions.length === 0 &&
              (result.reason === 'ML_UNAVAILABLE' || result.reason === 'TIMEOUT');

            if (shouldScheduleRetry) {
              this.scheduleSuggestRetry(query);
            } else {
              this.resetSuggestRetryState();
            }
          } else {
            this.resetSuggestRetryState();
          }

        },
        error: (error: HttpErrorResponse) => {
          const code = this.extractApiCode(error);
          if (error.status === 401 && code === 'ML_AUTH_INVALID') {
            this.mlAuthInvalid = true;
            this.categorySuggestDegraded = false;
            this.categorySuggestReason = null;
            this.categorySuggestTraceId =
              (typeof error.error?.traceId === 'string' ? error.error.traceId : null) || error.headers?.get('X-Correlation-Id');
            this.categorySuggestions = [];
            this.rebuildCategorySelectOptions();
            this.resetSuggestRetryState();
            if (manual) {
              this.toastr.warning(this.buildErrorMessage('Sessao ML invalida. Reconecte a integracao.', error), 'Publicacoes');
            }
            return;
          }

          if (error.status >= 500 || error.status === 0) {
            this.categorySuggestions = [];
            this.categorySuggestDegraded = true;
            this.categorySuggestReason = 'ML_UNAVAILABLE';
            this.categorySuggestTraceId = this.extractTraceId(error);
            this.rebuildCategorySelectOptions();
            this.debugWizardEvent('suggest_degraded_received', {
              traceId: this.categorySuggestTraceId,
              reason: this.categorySuggestReason,
              sellerId: this.state.sellerId,
              siteId: this.normalizeSiteId(this.state.siteId),
              query,
              source: fromRetry ? 'retry' : (manual ? 'manual' : 'auto')
            });
            const shouldScheduleRetry = !this.state.categoryId.trim();
            if (shouldScheduleRetry) {
              this.scheduleSuggestRetry(query);
            } else {
              this.resetSuggestRetryState();
            }
            if (manual) {
              this.toastr.warning('Sugestao indisponivel no momento. Tente novamente.', 'Publicacoes');
            }
            return;
          }

          this.categorySuggestions = [];
          this.categorySuggestDegraded = false;
          this.categorySuggestReason = null;
          this.categorySuggestTraceId = this.extractTraceId(error);
          this.rebuildCategorySelectOptions();
          this.resetSuggestRetryState();
          this.notifyAutomaticFailure('suggest', this.buildErrorMessage('Falha ao sugerir categorias.', error), manual);
        }
      });
  }

  retryCategoryAttributes(): void {
    this.loadCategoryCapabilities(true);
  }

  retryEstimate(): void {
    this.resumeAutoEstimate();
    this.estimateFees({ manual: true });
  }

  private queueAutosave(): void {
    if (this.missingVariantBlocked) {
      return;
    }

    if (this.prefillHydrating) {
      return;
    }

    this.clearPublishInputInvalidState();

    if (this.lastValidatedRowVersion) {
      this.lastValidationIsValid = false;
      this.lastValidatedRowVersion = null;
    }

    if (this.autosaveInFlight) {
      this.autosavePending = true;
      return;
    }

    this.autosave$.next();
  }

  private runAutosave(): void {
    if (this.autosaveInFlight) {
      this.autosavePending = true;
      return;
    }

    this.autosaveInFlight = true;
    this.upsertDraft()
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.autosaveInFlight = false;
          const shouldReplay = this.autosavePending;
          this.autosavePending = false;
          if (shouldReplay && !this.destroyed) {
            this.autosave$.next();
          }
        })
      )
      .subscribe();
  }

  private queueEstimate(): void {
    if (this.missingVariantBlocked) {
      return;
    }

    const validity = this.refreshCategoryValidity(this.state.categoryId);
    if (!validity.isValid) {
      this.trackCategoryGuardSkip('queue_estimate', validity);
      this.clearAutoEstimateRetryTimer();
      this.autoEstimateRetryKey = null;
      if (validity.reason === 'site_invalid' || validity.reason === 'format_invalid') {
        this.autoEstimatePaused = true;
        this.autoEstimatePauseReason = 'category_invalid';
        this.autoEstimatePausedKey = this.buildEstimateInputKey(validity);
      } else {
        this.autoEstimatePaused = false;
        this.autoEstimatePauseReason = null;
        this.autoEstimatePausedKey = null;
      }
      return;
    }

    if (this.autoEstimatePaused) {
      const nextKey = this.buildEstimateInputKey(validity);
      if (this.autoEstimatePauseReason === 'category_invalid' || !this.autoEstimatePausedKey || nextKey !== this.autoEstimatePausedKey) {
        this.resumeAutoEstimate();
      } else {
        return;
      }
    }

    this.estimate$.next();
  }

  private upsertDraft(): Observable<void> {
    if (!this.state.variantSku || !this.state.integrationId) {
      return of(void 0);
    }

    const clearFields: string[] = [];
    if (this.pendingCategoryClear) {
      clearFields.push('categoryId');
      this.debugWizardEvent('draft_category_clear_queued', {
        reason: 'legacy_or_manual_clear',
        draftId: this.draftId ?? null,
        variantSku: this.state.variantSku
      });
    }

    this.saving = true;
    return this.publicationsService
      .upsertDraft({
        draftId: this.draftId,
        integrationId: this.state.integrationId,
        channel: this.state.channel,
        sellerId: this.state.sellerId || null,
        siteId: this.normalizeSiteId(this.state.siteId),
        sabrVariantSku: this.state.variantSku,
        categoryId: this.state.categoryId || null,
        listingTypeId: this.state.listingTypeId || null,
        condition: this.state.condition || null,
        title: this.state.title || null,
        description: this.state.description || null,
        price: this.state.price,
        productCost: this.state.productCost,
        operationalCost: this.state.operationalCost,
        currencyId: this.state.currencyId || null,
        gtin: this.state.gtin || null,
        emptyGtinReason: this.state.emptyGtinReason || null,
        ncm: this.state.ncm || null,
        origin: this.state.origin || null,
        images: this.state.images,
        attributes: this.state.attributes,
        publishMode: this.state.publishMode,
        selectedVariantSkus: this.state.selectedVariantSkus,
        variationAxes: this.state.variationAxes,
        clearFields: clearFields.length > 0 ? clearFields : null
      })
      .pipe(
        tap((draft) => {
          const previousRowVersion = this.rowVersion;
          this.applyDraft(draft);
          this.autosaveConflictRetryArmed = false;
          if (previousRowVersion && this.rowVersion && previousRowVersion !== this.rowVersion) {
            this.lastValidationIsValid = false;
            this.lastValidatedRowVersion = null;
          }
        }),
        map(() => void 0),
        catchError((error: HttpErrorResponse) => this.handleUpsertDraftError(error)),
        finalize(() => (this.saving = false))
      );
  }

  private handleUpsertDraftError(error: HttpErrorResponse): Observable<void> {
    const code = this.extractApiCode(error);
    const traceId = this.extractTraceId(error);
    const requestId = this.extractRequestId(error);

    if (error.status === 409 && code === 'DRAFT_CONCURRENCY_CONFLICT') {
      if (this.autosaveConflictRetryArmed) {
        this.autosaveConflictRetryArmed = false;
        this.debugWizardEvent('wizard_autosave_conflict_recovered', {
          mode: 'retry_exhausted',
          draftId: this.draftId ?? null,
          variantSku: this.state.variantSku,
          traceId,
          requestId
        });
        this.showAutosaveToast(
          this.buildErrorMessage('Conflito de versao persistente ao salvar draft. Atualize a pagina.', error),
          'warning'
        );
        return of(void 0);
      }

      this.autosaveConflictRetryArmed = true;
      return this.recoverAutosaveConflict(error);
    }

    if (error.status === 503 || code === 'ML_UNAVAILABLE' || error.status >= 500 || error.status === 0) {
      this.autosaveConflictRetryArmed = false;
      this.debugWizardEvent('wizard_autosave_unavailable', {
        draftId: this.draftId ?? null,
        variantSku: this.state.variantSku,
        status: error.status,
        code,
        traceId,
        requestId
      });
      this.showAutosaveToast(
        this.buildErrorMessage('Falha temporaria ao salvar draft. Tente novamente.', error),
        'warning'
      );
      return of(void 0);
    }

    this.autosaveConflictRetryArmed = false;
    this.debugWizardEvent('wizard_autosave_error', {
      draftId: this.draftId ?? null,
      variantSku: this.state.variantSku,
      status: error.status,
      code,
      traceId,
      requestId
    });
    this.showAutosaveToast(this.buildErrorMessage('Falha ao salvar draft.', error), 'danger');
    return of(void 0);
  }

  private recoverAutosaveConflict(error: HttpErrorResponse): Observable<void> {
    const traceId = this.extractTraceId(error);
    const requestId = this.extractRequestId(error);
    if (!this.state.variantSku) {
      return of(void 0);
    }

    this.debugWizardEvent('wizard_autosave_conflict_recovered', {
      mode: 'reload_and_retry',
      draftId: this.draftId ?? null,
      variantSku: this.state.variantSku,
      traceId,
      requestId
    });

    return this.publicationsService
      .getDraft({
        variantSku: this.state.variantSku,
        channel: this.state.channel,
        sellerId: this.state.sellerId || null,
        integrationId: this.state.integrationId || null
      })
      .pipe(
        tap((result) => {
          if (result.draft) {
            const previousRowVersion = this.rowVersion;
            this.applyDraft(result.draft);
            if (previousRowVersion && this.rowVersion && previousRowVersion !== this.rowVersion) {
              this.lastValidationIsValid = false;
              this.lastValidatedRowVersion = null;
            }
          }

          // Retry once after reloading the latest draft snapshot.
          this.autosavePending = true;
        }),
        map(() => void 0),
        catchError((reloadError: HttpErrorResponse) => {
          this.autosaveConflictRetryArmed = false;
          this.showAutosaveToast(
            this.buildErrorMessage('Conflito ao salvar draft. Atualize a pagina e tente novamente.', reloadError),
            'warning'
          );
          return of(void 0);
        })
      );
  }

  private showAutosaveToast(message: string, level: 'warning' | 'danger'): void {
    const now = Date.now();
    if (now - this.autosaveLastToastAt < this.autosaveToastThrottleMs) {
      return;
    }

    this.autosaveLastToastAt = now;
    if (level === 'warning') {
      this.toastr.warning(message, 'Publicacoes');
      return;
    }

    this.toastr.danger(message, 'Publicacoes');
  }

  private readRouterPrefill(): PublicationRouterStatePrefill | null {
    const navState = (this.router.getCurrentNavigation()?.extras?.state as PublicationRouterStatePrefill | undefined) ?? null;
    const historyState =
      typeof history !== 'undefined'
        ? ((history.state as PublicationRouterStatePrefill | undefined) ?? null)
        : null;
    const source = navState ?? historyState;
    if (!source) {
      return null;
    }

    const variantSku = (source.variantSku ?? '').trim();
    const titleSuggestion = (source.titleSuggestion ?? '').trim();
    const description = (source.description ?? '').trim();
    const gtin = (source.gtin ?? '').trim();
    const ncm = (source.ncm ?? '').trim();
    const origin = (source.origin ?? '').trim();
    const images = (source.images ?? [])
      .filter((item) => !!item?.url?.trim())
      .map((item, index) => ({
        url: item.url.trim(),
        position: index + 1
      }));

    return {
      variantSku: variantSku || undefined,
      titleSuggestion: titleSuggestion || undefined,
      description: description || null,
      gtin: gtin || null,
      ncm: ncm || null,
      origin: origin || null,
      purchaseCost: typeof source.purchaseCost === 'number' && Number.isFinite(source.purchaseCost) ? source.purchaseCost : null,
      purchaseCostScale: this.parseMoneyScaleHint(source.purchaseCostScale),
      catalogPrice: typeof source.catalogPrice === 'number' && Number.isFinite(source.catalogPrice) ? source.catalogPrice : null,
      catalogPriceScale: this.parseMoneyScaleHint(source.catalogPriceScale),
      images
    };
  }

  private parseMoneyScaleHint(rawValue: unknown): MoneyScale {
    const normalized = (typeof rawValue === 'string' ? rawValue : '').trim().toLowerCase();
    if (normalized === 'cents') {
      return 'cents';
    }

    if (normalized === 'brl') {
      return 'brl';
    }

    return null;
  }

  private syncSalePriceInputFromState(): void {
    if (typeof this.state.price !== 'number' || !Number.isFinite(this.state.price) || this.state.price <= 0) {
      this.salePriceInput = '';
      return;
    }

    this.salePriceInput = this.formatBrlNumberInput(this.state.price);
  }

  private formatBrlNumberInput(value: number): string {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  private tryParseBrlPriceInput(rawValue: string, strict: boolean): number | null {
    const raw = (rawValue ?? '').trim();
    if (!raw) {
      return null;
    }

    const normalized = raw.replace(/[R$\s]/g, '');
    if (!normalized) {
      return null;
    }

    if (!strict && (normalized.endsWith(',') || normalized.endsWith('.'))) {
      return null;
    }

    let normalizedDecimal = '';
    if (normalized.includes(',')) {
      normalizedDecimal = normalized.replace(/\./g, '').replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(normalizedDecimal)) {
        return null;
      }
    } else if (normalized.includes('.')) {
      const dotCount = normalized.split('.').length - 1;
      if (dotCount !== 1) {
        return null;
      }

      const parts = normalized.split('.');
      if (parts.length !== 2) {
        return null;
      }

      const integerPart = parts[0];
      const decimalPart = parts[1];
      if (!/^\d+$/.test(integerPart) || !/^\d+$/.test(decimalPart)) {
        return null;
      }

      if (strict && decimalPart.length > 2) {
        return null;
      }

      if (!strict && decimalPart.length > 2) {
        return null;
      }

      normalizedDecimal = `${integerPart}.${decimalPart}`;
    } else {
      if (!/^\d+$/.test(normalized)) {
        return null;
      }

      normalizedDecimal = normalized;
    }

    const parsed = Number(normalizedDecimal);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return this.roundMoneyValue(parsed);
  }

  private roundMoneyValue(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private looksLikeCentsCandidate(value: number): boolean {
    return Number.isInteger(value) && value >= 10_000 && value % 100 === 0;
  }

  private tryInferCentsToBrl(rawValue: number, source: 'routerState' | 'myProducts' | 'snapshot'): number | null {
    if (!this.looksLikeCentsCandidate(rawValue)) {
      return null;
    }

    const candidate = this.roundMoneyValue(rawValue / 100);
    if (candidate <= 0) {
      return null;
    }

    const salePrice = this.state.price;
    if (typeof salePrice === 'number' && Number.isFinite(salePrice) && salePrice > 0) {
      const isCoherentWithPrice = candidate <= salePrice * 3 && rawValue >= salePrice * 20;
      return isCoherentWithPrice ? candidate : null;
    }

    if (source === 'routerState' && candidate <= 2_000) {
      return candidate;
    }

    return null;
  }

  private normalizePrefillMoney(
    rawValue: number,
    source: 'routerState' | 'myProducts' | 'snapshot',
    field: 'purchaseCost' | 'catalogPrice' | 'snapshotCost',
    scaleHint: MoneyScale,
    allowInference: boolean
  ): number {
    if (!Number.isFinite(rawValue)) {
      return rawValue;
    }

    const roundedRawValue = this.roundMoneyValue(rawValue);
    if (scaleHint === 'cents') {
      const normalized = this.roundMoneyValue(roundedRawValue / 100);
      this.debugWizardEvent('prefill_money_normalized', {
        source,
        field,
        mode: 'hint_cents',
        before: roundedRawValue,
        after: normalized
      });
      return normalized;
    }

    if (scaleHint === 'brl') {
      return roundedRawValue;
    }

    if (!allowInference) {
      return roundedRawValue;
    }

    const inferred = this.tryInferCentsToBrl(roundedRawValue, source);
    if (inferred != null) {
      this.debugWizardEvent('prefill_money_normalized', {
        source,
        field,
        mode: 'inferred_cents',
        before: roundedRawValue,
        after: inferred
      });
      return inferred;
    }

    if (this.looksLikeCentsCandidate(roundedRawValue)) {
      this.debugWizardEvent('prefill_money_scale_ambiguous', {
        source,
        field,
        value: roundedRawValue
      });
    }

    return roundedRawValue;
  }

  private buildErrorMessage(base: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId = this.extractTraceId(error);
    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : base;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }

  private extractTraceId(error: HttpErrorResponse): string | null {
    return (typeof error.error?.traceId === 'string' ? error.error.traceId : null) || error.headers?.get('X-Correlation-Id');
  }

  private extractRequestId(error: HttpErrorResponse): string | null {
    return (typeof error.error?.requestId === 'string' ? error.error.requestId : null) || error.headers?.get('X-Request-Id');
  }

  private getSectionId(stepId: string): string {
    return `wizard-section-${stepId}`;
  }

  private getCandidateNameFor(variantSku: string): string {
    const normalized = (variantSku ?? '').trim().toUpperCase();
    if (!normalized) {
      return '';
    }

    const candidate = this.candidateVariants.find((item) => item.sabrVariantSku.toUpperCase() === normalized);
    return candidate?.name?.trim() ?? '';
  }

  private isSkuNotFoundError(error: HttpErrorResponse): boolean {
    return error.status === 422 && this.extractApiCode(error) === 'SKU_NOT_FOUND';
  }

  private extractApiCode(error: HttpErrorResponse): string {
    return (error.error?.code ?? '').toString().trim().toUpperCase();
  }

  private clearPublishInputInvalidState(): void {
    this.publishInputInvalid = false;
  }

  private clearFeesInputInvalidState(): void {
    this.feesInputInvalid = false;
    this.feesInputInvalidTraceId = null;
  }

  private normalizeSiteId(siteId?: string): string {
    const normalized = (siteId ?? '').trim().toUpperCase();
    return normalized || 'MLB';
  }

  private normalizeCategoryId(categoryId?: string): string {
    return (categoryId ?? '').trim().toUpperCase();
  }

  private normalizeCategorySearchQuery(value?: string): string {
    return (value ?? '').trim().toUpperCase();
  }

  private normalizeCategoryLabel(label?: string | null): string | null {
    const normalized = (label ?? '').trim();
    return normalized || null;
  }

  private resolveSellerCategoryLabel(categoryName?: string | null, categoryPathFromRoot?: string | null): string | null {
    const normalizedName = this.normalizeCategoryLabel(categoryName);
    if (normalizedName) {
      return normalizedName;
    }

    const normalizedPath = this.normalizeCategoryLabel(categoryPathFromRoot);
    if (!normalizedPath) {
      return null;
    }

    const segments = normalizedPath
      .split('>')
      .map((segment) => segment.trim())
      .filter((segment) => !!segment);
    return segments.length > 0 ? segments[segments.length - 1] : normalizedPath;
  }

  private rememberCategoryLabel(categoryId: string, label?: string | null): void {
    const normalizedCategoryId = this.normalizeCategoryId(categoryId);
    const normalizedLabel = this.normalizeCategoryLabel(label);
    if (!normalizedCategoryId || !normalizedLabel) {
      return;
    }

    this.categoryLabelById.set(normalizedCategoryId, normalizedLabel);
  }

  private buildCategoryOptionDisplayLabel(categoryId: string, label?: string | null): string {
    const normalizedCategoryId = this.normalizeCategoryId(categoryId);
    if (!normalizedCategoryId) {
      return '';
    }

    const normalizedLabel = this.normalizeCategoryLabel(label);
    if (!normalizedLabel || normalizedLabel.toUpperCase() === normalizedCategoryId) {
      return 'Carregando categoria...';
    }

    return normalizedLabel;
  }

  private buildCategoryOptionsKey(): string {
    const currentCategoryId = this.normalizeCategoryId(this.state.categoryId);
    const selectedLabel = this.normalizeCategoryLabel(this.selectedCategoryLabel) ?? '';
    const suggestionPart = this.categorySuggestions
      .map((item) => {
        const categoryId = this.normalizeCategoryId(item.categoryId);
        const label = this.resolveSellerCategoryLabel(item.categoryName, item.pathFromRoot) ?? '';
        const source = (item.source ?? '').toString().trim().toLowerCase();
        return `${categoryId}:${label}:${source}`;
      })
      .join('|');
    const recentPart = this.recentCategories
      .map((item) => {
        const categoryId = this.normalizeCategoryId(item.categoryId);
        const label = this.normalizeCategoryLabel(item.label) ?? '';
        return `${categoryId}:${label}`;
      })
      .join('|');
    return [this.normalizeSiteId(this.state.siteId), currentCategoryId, selectedLabel, suggestionPart, recentPart].join('||');
  }

  private rebuildCategorySelectOptions(): void {
    const nextKey = this.buildCategoryOptionsKey();
    if (nextKey === this.lastCategoryOptionsKey) {
      this.refreshCategorySelectGroups();
      return;
    }

    this.lastCategoryOptionsKey = nextKey;
    const options: CategorySelectOption[] = [];
    const knownIds = new Set<string>();
    const currentCategoryId = this.normalizeCategoryId(this.state.categoryId);

    if (currentCategoryId) {
      const label = this.normalizeCategoryLabel(this.selectedCategoryLabel) ?? this.resolveSelectedCategoryLabel(currentCategoryId);
      options.push({
        categoryId: currentCategoryId,
        label,
        displayLabel: this.buildCategoryOptionDisplayLabel(currentCategoryId, label),
        source: 'selected'
      });
      knownIds.add(currentCategoryId);
    }

    for (const item of this.categorySuggestions) {
      const categoryId = this.normalizeCategoryId(item.categoryId);
      if (!categoryId || knownIds.has(categoryId)) {
        continue;
      }

      const label = this.resolveSellerCategoryLabel(item.categoryName, item.pathFromRoot);
      if (label) {
        this.rememberCategoryLabel(categoryId, label);
      }
      options.push({
        categoryId,
        label,
        displayLabel: this.buildCategoryOptionDisplayLabel(categoryId, label),
        source: 'suggestion',
        suggestionItem: item
      });
      knownIds.add(categoryId);
    }

    for (const item of this.recentCategories) {
      const categoryId = this.normalizeCategoryId(item.categoryId);
      if (!categoryId || knownIds.has(categoryId)) {
        continue;
      }

      const label = this.normalizeCategoryLabel(item.label);
      if (label) {
        this.rememberCategoryLabel(categoryId, label);
      }
      options.push({
        categoryId,
        label,
        displayLabel: this.buildCategoryOptionDisplayLabel(categoryId, label),
        source: 'recent',
        recentItem: item
      });
      knownIds.add(categoryId);
    }

    this.categorySelectOptionsState = options;
    this.refreshCategorySelectGroups();
    if (!this.state.categoryId.trim()) {
      queueMicrotask(() => this.tryAutoSelectSingleCategoryOption());
    }
  }

  private refreshCategorySelectGroups(): void {
    const query = this.normalizeCategorySearchQuery(this.categorySelectFilterQuery);
    const previousActiveId = this.categorySelectFilteredOptionsState[this.categorySelectActiveIndex]?.categoryId ?? null;
    const groups: CategorySelectGroup[] = [];
    const filtered: CategorySelectOption[] = [];
    const groupDefinitions: Array<{ key: CategorySelectSource; label: string }> = [
      { key: 'selected', label: 'Selecionada' },
      { key: 'suggestion', label: 'Sugestoes' },
      { key: 'recent', label: 'Recentes' }
    ];

    for (const groupDefinition of groupDefinitions) {
      const options = this.categorySelectOptionsState.filter((option) => option.source === groupDefinition.key);
      const visibleOptions = options.filter((option) => {
        if (!query) {
          return true;
        }

        const label = this.normalizeCategorySearchQuery(option.displayLabel);
        const categoryId = this.normalizeCategorySearchQuery(option.categoryId);
        const rawLabel = this.normalizeCategorySearchQuery(option.label ?? '');
        return label.includes(query) || categoryId.includes(query) || rawLabel.includes(query);
      });

      if (visibleOptions.length === 0) {
        continue;
      }

      groups.push({
        key: groupDefinition.key,
        label: groupDefinition.label,
        options: visibleOptions
      });
      filtered.push(...visibleOptions);
    }

    this.categorySelectGroupsState = groups;
    this.categorySelectFilteredOptionsState = filtered;

    if (filtered.length === 0) {
      this.categorySelectActiveIndex = -1;
      return;
    }

    if (previousActiveId) {
      const index = filtered.findIndex((option) => option.categoryId === previousActiveId);
      if (index >= 0) {
        this.categorySelectActiveIndex = index;
        return;
      }
    }

    if (!this.categorySelectOpen) {
      this.categorySelectActiveIndex = -1;
      return;
    }

    if (this.categorySelectActiveIndex < 0 || this.categorySelectActiveIndex >= filtered.length) {
      this.categorySelectActiveIndex = 0;
    }
  }

  private tryAutoSelectSingleCategoryOption(): void {
    if (this.destroyed || !!this.state.categoryId.trim() || this.categoryResolutionBlockedByMl) {
      return;
    }

    const validOptions = this.categorySelectOptionsState.filter(
      (option) =>
        option.source === 'suggestion' &&
        option.suggestionItem?.source === 'domain_discovery' &&
        this.validateCategory(this.state.siteId, option.categoryId).isValid
    );
    if (validOptions.length !== 1) {
      return;
    }

    const autoSelectKey = this.lastCategoryOptionsKey || this.buildCategoryOptionsKey();
    if (this.autoSelectedCategoryKeys.has(autoSelectKey)) {
      return;
    }

    this.autoSelectedCategoryKeys.add(autoSelectKey);
    const selected = validOptions[0];
    this.onCategoryIdChanged(selected.categoryId, 'manual_dropdown', selected.label);
  }

  private resolveSelectedCategoryLabel(categoryId: string): string | null {
    const normalizedCategoryId = this.normalizeCategoryId(categoryId);
    if (!normalizedCategoryId) {
      return null;
    }

    const cachedLabel = this.normalizeCategoryLabel(this.categoryLabelById.get(normalizedCategoryId));
    if (cachedLabel) {
      return cachedLabel;
    }

    const recentItem = this.recentCategories.find((item) => this.normalizeCategoryId(item.categoryId) === normalizedCategoryId);
    const recentLabel = this.normalizeCategoryLabel(recentItem?.label);
    if (recentLabel) {
      return recentLabel;
    }

    const suggestionItem = this.categorySuggestions.find(
      (item) => this.normalizeCategoryId(item.categoryId) === normalizedCategoryId
    );
    const suggestionLabel = this.resolveSellerCategoryLabel(suggestionItem?.categoryName, suggestionItem?.pathFromRoot);
    return suggestionLabel ?? null;
  }

  private normalizeCategoryCapabilities(result: MarketplaceCategoryAttributesResult): MarketplaceCategoryAttributesResult {
    return {
      ...result,
      requiredAttributes: result.requiredAttributes ?? [],
      conditionalAttributes: result.conditionalAttributes ?? [],
      optionalAttributes: result.optionalAttributes ?? []
    };
  }

  private rebuildOptionalCategoryAttributes(): void {
    this.optionalAttributeOptionsById.clear();
    if (!this.categoryCapabilities) {
      this.optionalCategoryAttributesState = [];
      this.showOptionalAttributes = false;
      this.showAllOptionalAttributes = false;
      this.optionalAttributesQuery = '';
      return;
    }

    const merged = [...(this.categoryCapabilities.conditionalAttributes ?? []), ...(this.categoryCapabilities.optionalAttributes ?? [])];
    const deduped: MarketplaceCategoryAttributeResult[] = [];
    const seen = new Set<string>();
    for (const attribute of merged) {
      const normalizedAttributeId = this.normalizeCategoryId(attribute.id);
      if (!normalizedAttributeId || seen.has(normalizedAttributeId)) {
        continue;
      }

      seen.add(normalizedAttributeId);
      deduped.push(attribute);
      const values = attribute.values ?? [];
      const notApplicableValue = this.resolveNotApplicableValue(attribute);
      if (!notApplicableValue) {
        this.optionalAttributeOptionsById.set(normalizedAttributeId, values);
        continue;
      }

      const notApplicableKey = `${notApplicableValue.id}|${notApplicableValue.name}`;
      const withoutNotApplicable = values.filter((item) => `${item.id}|${item.name}` !== notApplicableKey);
      this.optionalAttributeOptionsById.set(normalizedAttributeId, [
        { id: notApplicableValue.id, name: 'N/A' },
        ...withoutNotApplicable
      ]);
      this.debugWizardEvent('attribute_not_applicable_detected', {
        categoryId: this.normalizeCategoryId(this.state.categoryId),
        attributeId: normalizedAttributeId,
        valueId: notApplicableValue.id,
        valueName: notApplicableValue.name
      });
    }

    this.optionalCategoryAttributesState = deduped;
    if (deduped.length === 0) {
      this.showOptionalAttributes = false;
    }
    this.showAllOptionalAttributes = false;
    this.optionalAttributesQuery = '';
  }

  private normalizeNaToken(value: string): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private resolveNotApplicableValue(attribute: MarketplaceCategoryAttributeResult): MarketplaceCategoryAttributeValueResult | null {
    const values = attribute.values ?? [];
    for (const value of values) {
      const normalizedName = this.normalizeNaToken(value.name ?? '');
      const normalizedId = this.normalizeNaToken(value.id ?? '');
      if (this.notApplicableTokens.has(normalizedName) || this.notApplicableTokens.has(normalizedId)) {
        return value;
      }
    }

    return null;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  private refreshCategoryValidity(categoryIdRaw?: string): CategoryValidityState {
    const next = this.validateCategory(this.state.siteId, categoryIdRaw);
    const current = this.categoryValidity;
    if (
      current.isValid !== next.isValid ||
      current.normalizedSiteId !== next.normalizedSiteId ||
      current.normalizedCategoryId !== next.normalizedCategoryId ||
      current.reason !== next.reason
    ) {
      this.categoryValidity = next;
    }

    return this.categoryValidity;
  }

  private validateCategory(siteIdRaw?: string, categoryIdRaw?: string): CategoryValidityState {
    const normalizedSiteId = this.normalizeSiteId(siteIdRaw);
    const normalizedCategoryId = this.normalizeCategoryId(categoryIdRaw);
    if (!normalizedCategoryId) {
      return {
        isValid: false,
        normalizedSiteId,
        normalizedCategoryId,
        reason: 'empty'
      };
    }

    if (!/^ML[A-Z]$/.test(normalizedSiteId)) {
      return {
        isValid: false,
        normalizedSiteId,
        normalizedCategoryId,
        reason: 'site_invalid'
      };
    }

    const categoryRegex = this.buildCategoryRegex(normalizedSiteId);
    if (!categoryRegex.test(normalizedCategoryId)) {
      return {
        isValid: false,
        normalizedSiteId,
        normalizedCategoryId,
        reason: 'format_invalid'
      };
    }

    return {
      isValid: true,
      normalizedSiteId,
      normalizedCategoryId,
      reason: 'ok'
    };
  }

  private hasCategoryFieldValidationError(error: HttpErrorResponse): boolean {
    const topLevelField = (error.error?.field ?? '').toString().trim().toLowerCase();
    if (topLevelField === 'categoryid' || topLevelField === 'category_id') {
      return true;
    }

    const errors = Array.isArray(error.error?.errors) ? error.error.errors : [];
    return errors.some((item: any) => {
      const field = (item?.field ?? item?.fieldPath ?? '').toString().trim().toLowerCase();
      return field === 'categoryid' || field === 'category_id' || field === 'categoryidraw' || field === 'categoryidnormalized';
    });
  }

  private clearCategoryCapabilityState(): void {
    this.latestCategoryCapabilitiesRequestSeq = ++this.categoryCapabilitiesRequestSeq;
    this.categoryCapabilities = null;
    this.rebuildOptionalCategoryAttributes();
    this.lastLoadedCategoryId = null;
    this.loadingCapabilities = false;
    this.categoryAttributesUnavailable = false;
    this.categoryAttributesTraceId = null;
    this.showAttributesUnavailableBanner = false;
  }

  isBooleanAttr(attr: MarketplaceCategoryAttributeResult): boolean {
    return (attr.valueType ?? '').trim().toLowerCase() === 'boolean';
  }

  private isDateAttr(attr: MarketplaceCategoryAttributeResult): boolean {
    return (attr.valueType ?? '').trim().toLowerCase() === 'date';
  }

  isNumberAttr(attr: MarketplaceCategoryAttributeResult): boolean {
    const normalized = (attr.valueType ?? '').trim().toLowerCase();
    return normalized === 'number' || normalized === 'number_unit';
  }

  getRequiredAttrInputType(attr: MarketplaceCategoryAttributeResult): 'text' | 'number' | 'date' {
    if (this.isDateAttr(attr)) {
      return 'date';
    }

    if (this.isNumberAttr(attr)) {
      return 'number';
    }

    return 'text';
  }

  private isRequiredAttributeFilled(attr: MarketplaceCategoryAttributeResult): boolean {
    if ((attr.values ?? []).length > 0) {
      return !!this.getAttributeOptionValue(attr.id).trim();
    }

    if (this.isBooleanAttr(attr)) {
      return this.getAttributeBooleanValue(attr.id);
    }

    return !!this.getAttributeDisplayValue(attr.id);
  }

  private pauseAutoEstimateForInvalidCategory(validity: CategoryValidityState, source: string): void {
    if (validity.reason !== 'site_invalid' && validity.reason !== 'format_invalid') {
      return;
    }

    this.clearAutoEstimateRetryTimer();
    this.autoEstimateRetryKey = null;
    this.autoEstimatePaused = true;
    this.autoEstimatePauseReason = 'category_invalid';
    this.autoEstimatePausedKey = this.buildEstimateInputKey(validity);
    this.showFeesUnavailableBanner = false;
    this.feesEstimateDegraded = false;
    this.debugWizardEvent('auto_estimate_paused_invalid_category', {
      source,
      reason: validity.reason,
      siteId: validity.normalizedSiteId,
      categoryId: validity.normalizedCategoryId
    });
  }

  private trackCategoryGuardSkip(endpoint: CategoryGuardEndpoint, validity: CategoryValidityState): void {
    if (validity.isValid) {
      this.categorySkipKeys[endpoint] = undefined;
      return;
    }

    const key = [validity.reason, validity.normalizedSiteId, validity.normalizedCategoryId].join('|');
    if (this.categorySkipKeys[endpoint] === key) {
      return;
    }

    this.categorySkipKeys[endpoint] = key;
    this.debugWizardEvent(`${endpoint}_skipped_invalid_category`, {
      reason: validity.reason,
      siteId: validity.normalizedSiteId,
      categoryId: validity.normalizedCategoryId
    });
  }

  private debugWizardEvent(event: string, payload: Record<string, unknown>): void {
    if (environment.production || environment.authDebugConsole === false || typeof console === 'undefined') {
      return;
    }

    console.info(`[WIZARD][CLIENT] ${event}`, payload);
  }

  private buildEstimateInputKey(validity?: CategoryValidityState): string {
    const resolved = validity ?? this.refreshCategoryValidity(this.state.categoryId);
    const categoryIdPart = resolved.isValid ? resolved.normalizedCategoryId : this.normalizeCategoryId(this.state.categoryId);
    return [
      (this.state.integrationId ?? '').trim(),
      resolved.normalizedSiteId,
      categoryIdPart,
      (this.state.listingTypeId ?? '').trim().toLowerCase(),
      this.toEstimateNumberKeyPart(this.state.price),
      this.toEstimateNumberKeyPart(this.effectiveProductCost),
      this.toEstimateNumberKeyPart(this.state.operationalCost)
    ].join('|');
  }

  private toEstimateNumberKeyPart(value: number | null): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '';
    }

    return value.toFixed(2);
  }

  private formatFeePercentLabel(rate: number): string {
    if (!Number.isFinite(rate) || rate <= 0) {
      return '-';
    }

    return `${(rate * 100).toFixed(2)}%`;
  }

  private scheduleSuggestRetry(query: string): void {
    if (this.suggestAutoPaused || this.state.categoryId.trim()) {
      return;
    }

    const delays = [1000, 3000, 7000];
    const nextAttempt = this.suggestRetryAttempt + 1;
    if (nextAttempt > delays.length) {
      this.suggestAutoPaused = true;
      this.suggestRetryNextAt = null;
      this.debugWizardEvent('suggest_retry_exhausted', {
        attempts: this.suggestRetryAttempt,
        sellerId: this.state.sellerId,
        siteId: this.normalizeSiteId(this.state.siteId),
        query
      });
      return;
    }

    this.clearSuggestRetryTimer();
    const delayMs = delays[nextAttempt - 1];
    this.suggestRetryAttempt = nextAttempt;
    this.suggestRetryNextAt = Date.now() + delayMs;
    this.debugWizardEvent('suggest_retry_scheduled', {
      attempt: this.suggestRetryAttempt,
      delayMs,
      sellerId: this.state.sellerId,
      siteId: this.normalizeSiteId(this.state.siteId),
      query
    });

    this.suggestRetryTimer = setTimeout(() => {
      this.suggestRetryTimer = null;
      if (this.destroyed || this.suggestAutoPaused || !!this.state.categoryId.trim()) {
        return;
      }

      if (!this.categorySuggestQuery.trim()) {
        return;
      }

      this.fetchCategorySuggestions(this.categorySuggestQuery, false, true);
    }, delayMs);
  }

  private clearSuggestRetryTimer(): void {
    if (this.suggestRetryTimer == null) {
      return;
    }

    clearTimeout(this.suggestRetryTimer);
    this.suggestRetryTimer = null;
  }

  private resetSuggestRetryState(): void {
    this.clearSuggestRetryTimer();
    this.suggestRetryAttempt = 0;
    this.suggestAutoPaused = false;
    this.suggestRetryNextAt = null;
  }

  private mlRecentKey(sellerId: string, siteId: string): string {
    return `ml_recent_categories:${sellerId}:${siteId}`;
  }

  private loadRecentCategories(sellerId: string, siteId: string): MlRecentCategory[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const raw = localStorage.getItem(this.mlRecentKey(sellerId, siteId));
      if (!raw) {
        return [];
      }

      const items = JSON.parse(raw) as MlRecentCategory[];
      const now = Date.now();
      return (items ?? [])
        .filter((item) => !!item?.categoryId && !!item?.siteId && !!item?.sellerId)
        .filter((item) => now - (item.lastUsedAt || 0) <= ML_RECENT_TTL_MS)
        .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0))
        .slice(0, ML_RECENT_MAX);
    } catch {
      return [];
    }
  }

  private saveRecentCategories(sellerId: string, siteId: string, items: MlRecentCategory[]): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.mlRecentKey(sellerId, siteId), JSON.stringify(items.slice(0, ML_RECENT_MAX)));
    } catch {
      // noop
    }
  }

  private upsertRecentCategory(item: MlRecentCategory): void {
    const sellerId = (item.sellerId ?? '').trim();
    const siteId = this.normalizeSiteId(item.siteId);
    const categoryId = this.normalizeCategoryId(item.categoryId);
    if (!sellerId || !siteId || !categoryId) {
      return;
    }

    const currentSiteId = this.normalizeSiteId(this.state.siteId);
    if (siteId !== currentSiteId) {
      return;
    }

    const now = Date.now();
    const current = this.loadRecentCategories(sellerId, siteId);
    const next: MlRecentCategory[] = [
      {
        categoryId,
        siteId,
        sellerId,
        label: (item.label ?? '').trim() || null,
        lastUsedAt: now
      },
      ...current.filter((entry) => entry.categoryId !== categoryId)
    ].slice(0, ML_RECENT_MAX);

    this.saveRecentCategories(sellerId, siteId, next);
    this.recentCategories = next;
    this.rebuildCategorySelectOptions();
  }

  private refreshRecentCategories(): void {
    const sellerId = (this.state.sellerId ?? '').trim();
    const siteId = this.normalizeSiteId(this.state.siteId);
    if (!sellerId || !siteId) {
      this.recentCategories = [];
      this.rebuildCategorySelectOptions();
      return;
    }

    this.recentCategories = this.loadRecentCategories(sellerId, siteId);
    this.rebuildCategorySelectOptions();
  }

  private clearAutoEstimateRetryTimer(): void {
    if (this.autoEstimateRetryTimer == null) {
      return;
    }

    clearTimeout(this.autoEstimateRetryTimer);
    this.autoEstimateRetryTimer = null;
  }

  private resumeAutoEstimate(): void {
    this.clearAutoEstimateRetryTimer();
    this.autoEstimateRetryKey = null;
    this.autoEstimatePaused = false;
    this.autoEstimatePauseReason = null;
    this.autoEstimatePausedKey = null;
  }

  private notifyAutomaticFailure(key: 'fees' | 'attributes' | 'suggest', message: string, forceToast: boolean): void {
    const now = Date.now();
    const state = this.autoFailureStats[key] ?? { count: 0, lastToastAt: 0 };
    state.count += 1;

    const shouldToast = forceToast || state.lastToastAt === 0 || now - state.lastToastAt >= 30_000;
    if (shouldToast) {
      this.toastr.warning(message, 'Publicacoes');
      state.lastToastAt = now;
    }

    this.autoFailureStats[key] = state;
    if (state.count >= 3) {
      if (key === 'fees') {
        this.showFeesUnavailableBanner = true;
      }

      if (key === 'attributes') {
        this.showAttributesUnavailableBanner = true;
      }
    }
  }

  private resetAutoFailureState(key: 'fees' | 'attributes' | 'suggest'): void {
    this.autoFailureStats[key] = { count: 0, lastToastAt: 0 };
  }

  private setMissingVariantBlock(): void {
    this.errorMessage = null;
    this.missingVariantBlocked = true;
    this.missingVariantMessage =
      'Catalogo incompleto: este SKU ainda nao tem variante cadastrada no SABR. Estamos corrigindo automaticamente. Tente novamente em alguns minutos.';
  }

  private clearMissingVariantBlock(): void {
    this.missingVariantBlocked = false;
    this.missingVariantMessage = null;
  }
}

