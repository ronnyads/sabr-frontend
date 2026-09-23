import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NbButtonModule,
  NbInputModule,
  NbSelectModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import {
  MyProductDraft,
  MyProductsService,
  PricingMode,
  UpdateMyProductDraftRequest
} from '../core/services/my-products.service';
import { formatBrlFromCents } from '../core/utils/money.utils';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SearchToolbarComponent } from '../shared/search-toolbar/search-toolbar.component';
import {
  MarketplaceListingWorkspace,
  MarketplaceMappingResult,
  MarketplaceUnmappedItem,
  MarketplaceMappingsService
} from '../core/services/marketplace-mappings.service';
import {
  MercadoLivreIntegrationService,
  MercadoLivreLinkCandidateResult
} from '../core/services/mercado-livre-integration.service';
import { CatalogService, CatalogVariant } from '../core/services/catalog.service';

interface MyProductRow {
  id: string;
  productSku: string;
  productName: string;
  thumbnailUrl?: string | null;
  pricingMode: PricingMode;
  markupPercent?: number | null;
  fixedPriceCents?: number | null;
  catalogPriceCentsSnapshot: number;
  finalPriceCentsSnapshot: number;
  rowVersion: string;
  isSaving: boolean;
  isRemoving: boolean;
  isDirty: boolean;
  editPricingMode: PricingMode;
  editMarkupPercent?: number | null;
  editFixedPriceCents?: number | null;
  mlOverallStatus: string;
  mlPublishedCount: number;
  mlDraftCount: number;
  mlErrorCount: number;
  hasProductVariant: boolean;
  variantStatus: string;
  resolvedVariantSku?: string | null;
  availableStock?: number | null;
  stockSource?: string | null;
  description?: string | null;
  images: Array<{ url: string; position: number }>;
  gtin?: string | null;
  ncm?: string | null;
  origin?: string | null;
  purchaseCost?: number | null;
  catalogPrice?: number | null;
  mappings: MarketplaceMappingResult[];
}

@Component({
  selector: 'app-client-my-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NbButtonModule,
    NbInputModule,
    NbSelectModule,
    UiStateComponent,
    PageHeaderComponent,
    SearchToolbarComponent
  ],
  templateUrl: './client-my-products.html',
  styleUrls: ['./client-my-products.scss']
})
export class ClientMyProducts implements OnInit, OnDestroy {
  readonly pricingMode = PricingMode;
  readonly searchControl = new FormControl('', { nonNullable: true });

  rows: MyProductRow[] = [];
  loading = false;
  errorMessage: string | null = null;
  hasConcurrencyConflict = false;
  hasPreconditionRequired = false;
  listingWorkspace: MarketplaceListingWorkspace | null = null;
  listingLoadingId: string | null = null;
  listingSaving = false;
  listingReviewing = false;
  listingDraftSaving = false;
  pendingListingDraftId: string | null = null;
  pendingListingChanges: { evaluationHash: string; mappingVersion: number; title?: string; price?: number; description?: string } | null = null;
  editListingTitle = '';
  editListingPrice: number | null = null;
  editListingDescription = '';
  linkProduct: MyProductRow | null = null;
  linkSellerId = '';
  linkQuery = '';
  linkCandidates: MercadoLivreLinkCandidateResult[] = [];
  linkCandidatesLoading = false;
  linkSavingKey: string | null = null;
  linkError: string | null = null;
  unmappedItems: MarketplaceUnmappedItem[] = [];
  unmappedLoading = false;
  unmappedReanalyzing = false;
  unmappedError: string | null = null;
  unmappedSelection: Record<string, string> = {};
  unmappedSaving: Record<string, boolean> = {};
  externalDraftKey: string | null = null;
  externalSupplierName = '';
  externalUnitCost: number | string | null = null;
  externalReason = '';
  externalSaving = false;
  allowedVariants: CatalogVariant[] = [];
  variantsLoading = false;
  focusedItemId = '';
  focusedVariationId = '';
  focusedSellerId = '';

  skip = 0;
  limit = 20;
  total = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly myProductsService: MyProductsService,
    private readonly marketplaceMappingsService: MarketplaceMappingsService,
    private readonly mercadoLivreService: MercadoLivreIntegrationService,
    private readonly catalogService: CatalogService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.focusedItemId = this.route.snapshot.queryParamMap.get('focusItem') ?? '';
    this.focusedVariationId = this.route.snapshot.queryParamMap.get('focusVariation') ?? '';
    this.focusedSellerId = this.route.snapshot.queryParamMap.get('focusSeller') ?? '';
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.loadDrafts();
      });

    this.loadDrafts();
    this.loadUnmappedProducts();
    this.loadAllowedVariants();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.rows.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  rowById(_: number, row: MyProductRow): string {
    return row.id;
  }

  unmappedByKey(_: number, item: MarketplaceUnmappedItem): string {
    return item.mappingKey;
  }

  unmappedTitle(item: MarketplaceUnmappedItem): string {
    return item.productName?.trim() || `Anúncio ${item.externalItemId}`;
  }

  unmappedInitial(item: MarketplaceUnmappedItem): string {
    return this.unmappedTitle(item).charAt(0).toLocaleUpperCase('pt-BR') || 'ML';
  }

  mappingReasonLabel(item: MarketplaceUnmappedItem): string {
    switch ((item.mappingReason ?? '').toLowerCase()) {
      case 'unmapped_missing_channel_sku':
        return 'SKU ausente no anúncio — selecione o produto correto';
      case 'unmapped_ambiguous_channel_sku':
        return 'SKU encontrado em mais de um produto — confirme manualmente';
      case 'unmapped_sku_not_authorized':
      case 'unmapped_mapping_not_authorized':
        return 'SKU fora do catálogo autorizado para esta conta';
      default:
        return item.channelSku
          ? `SKU ${item.channelSku} não encontrado no catálogo`
          : 'Vínculo automático indisponível';
    }
  }

  loadUnmappedProducts(): void {
    this.unmappedLoading = true;
    this.unmappedError = null;
    this.marketplaceMappingsService.listUnmappedItems('MercadoLivre')
      .pipe(finalize(() => (this.unmappedLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.unmappedItems = items ?? [];
          const focusIndex = this.unmappedItems.findIndex(item => this.isFocusedMapping(item));
          if (focusIndex > 0) {
            const [focused] = this.unmappedItems.splice(focusIndex, 1);
            this.unmappedItems.unshift(focused);
          }
          if (focusIndex >= 0) {
            setTimeout(() => document.getElementById('focused-mapping')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
          }
          const activeKeys = new Set(this.unmappedItems.map(item => item.mappingKey));
          for (const key of Object.keys(this.unmappedSelection)) {
            if (!activeKeys.has(key)) delete this.unmappedSelection[key];
          }
        },
        error: (error: HttpErrorResponse) => {
          this.unmappedError = this.buildErrorMessage('Não foi possível carregar os produtos pendentes de vínculo.', error);
        }
      });
  }

  isFocusedMapping(item: MarketplaceUnmappedItem): boolean {
    return !!this.focusedItemId
      && item.externalItemId === this.focusedItemId
      && (!this.focusedSellerId || String(item.sellerId ?? '') === this.focusedSellerId)
      && (!this.focusedVariationId || (item.externalVariationId ?? '') === this.focusedVariationId);
  }

  reanalyzePendingProducts(): void {
    if (this.unmappedReanalyzing) return;
    this.unmappedReanalyzing = true;
    this.marketplaceMappingsService.reanalyzePendingItems('MercadoLivre')
      .pipe(finalize(() => (this.unmappedReanalyzing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(
            result.itemsMapped > 0
              ? `${result.itemsMapped} item(ns) vinculado(s) e ${result.ordersReleased} pedido(s) liberado(s).`
              : 'Nenhuma correspondência única nova foi encontrada.',
            'Reanálise concluída'
          );
          this.myProductsService.invalidate();
          this.loadUnmappedProducts();
          this.loadDrafts();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Não foi possível reanalisar os vínculos.', error), 'Reanálise');
        }
      });
  }

  loadAllowedVariants(): void {
    if (this.variantsLoading || this.allowedVariants.length > 0) return;
    this.variantsLoading = true;
    this.catalogService.listCatalogVariants(0, 200)
      .pipe(finalize(() => (this.variantsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.allowedVariants = (result.items ?? []).filter(item => this.isInternalCatalogSku(item.variantSku));
        },
        error: () => {
          this.toastr.warning('Não foi possível carregar os produtos liberados do catálogo.', 'Catálogo');
        }
      });
  }

  linkUnmappedProduct(item: MarketplaceUnmappedItem): void {
    const selectedCatalogSku = (this.unmappedSelection[item.mappingKey] ?? '').trim();
    if (!selectedCatalogSku || this.unmappedSaving[item.mappingKey]) return;

    this.unmappedSaving[item.mappingKey] = true;
    this.marketplaceMappingsService.createMapping({
      provider: 'MercadoLivre',
      integrationId: item.integrationId ?? null,
      sellerId: item.sellerId ?? null,
      externalItemId: item.externalItemId,
      externalVariationId: item.externalVariationId ?? null,
      selectedCatalogSku
    }).pipe(
      finalize(() => (this.unmappedSaving[item.mappingKey] = false)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (result) => {
        this.toastr.success(
          result.ordersAffected > 0
            ? result.ordersAffected + ' pedido(s) atualizado(s). O pagamento já pode ser revisado.'
            : 'Produto vinculado ao catálogo.',
          'Vínculo concluído'
        );
        delete this.unmappedSelection[item.mappingKey];
        this.myProductsService.invalidate();
        this.loadUnmappedProducts();
        this.loadDrafts();
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.danger(this.buildErrorMessage('Falha ao vincular o produto ao catálogo.', error), 'Vínculo');
      }
    });
  }

  openExternalClassification(item: MarketplaceUnmappedItem): void {
    this.externalDraftKey = item.mappingKey;
    this.externalSupplierName = item.externalSupplierName ?? '';
    this.externalUnitCost = item.externalUnitCostCents == null ? null : item.externalUnitCostCents / 100;
    this.externalReason = '';
  }

  closeExternalClassification(): void {
    if (this.externalSaving) return;
    this.externalDraftKey = null;
    this.externalSupplierName = '';
    this.externalUnitCost = null;
    this.externalReason = '';
  }

  externalDraftIsValid(): boolean {
    const cost = this.parseExternalCost(this.externalUnitCost);
    return this.externalSupplierName.trim().length >= 2
      && cost !== null
      && cost >= 0;
  }

  saveExternalClassification(item: MarketplaceUnmappedItem): void {
    if (!this.externalDraftIsValid() || this.externalSaving || item.sellerId == null) return;
    this.externalSaving = true;
    this.marketplaceMappingsService.classifyExternalSupplier({
      provider: 'MercadoLivre',
      integrationId: item.integrationId ?? null,
      sellerId: String(item.sellerId),
      externalItemId: item.externalItemId,
      externalVariationId: item.externalVariationId ?? null,
      supplierName: this.externalSupplierName.trim(),
      reason: this.externalReason.trim() || null,
      unitCostCents: Math.round((this.parseExternalCost(this.externalUnitCost) ?? 0) * 100),
      currencyId: 'BRL'
    }).pipe(
      finalize(() => (this.externalSaving = false)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: result => {
        this.toastr.success(
          `${result.itemsAffected} item(ns) atualizado(s). O primeiro custo resolve vendas pendentes; alterações futuras preservam o histórico.`,
          'Produto externo classificado'
        );
        this.closeExternalClassification();
        this.myProductsService.invalidate();
        this.loadUnmappedProducts();
        this.loadDrafts();
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.danger(this.buildErrorMessage('Não foi possível classificar o produto externo.', error), 'Produto externo');
      }
    });
  }

  selectedVariant(mappingKey: string): CatalogVariant | null {
    const sku = this.unmappedSelection[mappingKey];
    return this.allowedVariants.find(item => item.variantSku === sku) ?? null;
  }

  catalogVariantLabel(variant: CatalogVariant): string {
    const name = [variant.productName, variant.variantName].filter(Boolean).join(' / ');
    return variant.variantSku + ' — ' + name;
  }

  private isInternalCatalogSku(sku: string | null | undefined): boolean {
    const normalized = (sku ?? '').trim().toUpperCase();
    return !/^MLBU?\d+$/.test(normalized);
  }

  retry(): void {
    this.hasConcurrencyConflict = false;
    this.hasPreconditionRequired = false;
    this.loadDrafts();
  }

  onToolbarSearchChange(value: string): void {
    this.searchControl.setValue(value ?? '');
  }

  clearToolbar(): void {
    this.searchControl.setValue('');
  }

  reloadAfterConflict(): void {
    this.toastr.info('Lista atualizada com a versao mais recente.', 'Recarregado');
    this.retry();
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(0, this.skip - this.limit);
    this.loadDrafts();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadDrafts();
  }

  onRowChanged(row: MyProductRow): void {
    row.isDirty = true;
    this.hasConcurrencyConflict = false;
    this.hasPreconditionRequired = false;
  }

  save(row: MyProductRow): void {
    if (row.isSaving) {
      return;
    }

    const request: UpdateMyProductDraftRequest = {
      pricingMode: row.editPricingMode,
      markupPercent: null,
      fixedPriceCents: null,
      rowVersion: row.rowVersion
    };

    if (row.editPricingMode === PricingMode.MarkupPercent) {
      request.markupPercent = this.toNumberOrNull(row.editMarkupPercent);
    }

    if (row.editPricingMode === PricingMode.FixedPrice) {
      request.fixedPriceCents = this.toIntegerOrNull(row.editFixedPriceCents);
    }

    row.isSaving = true;
    this.myProductsService
      .updateMyProduct(row.id, request, row.rowVersion)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.applyDraft(row, updated);
          row.isSaving = false;
          row.isDirty = false;
          this.toastr.success('Draft atualizado com sucesso.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          row.isSaving = false;
          if (error.status === 409) {
            this.hasConcurrencyConflict = true;
            this.toastr.warning('Draft alterado por outra sessao. Recarregue os dados.', 'Conflito');
            return;
          }

          if (error.status === 428) {
            this.hasPreconditionRequired = true;
            this.toastr.warning('Precondicao ausente. Recarregue o draft e tente novamente.', 'Precondicao obrigatoria');
            return;
          }

          this.toastr.danger(this.buildErrorMessage('Falha ao salvar draft.', error), 'Erro');
        }
      });
  }

  remove(row: MyProductRow): void {
    if (row.isRemoving) {
      return;
    }

    row.isRemoving = true;
    this.myProductsService
      .deleteMyProduct(row.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          row.isRemoving = false;
          this.rows = this.rows.filter((item) => item.id !== row.id);
          this.total = Math.max(0, this.total - 1);
          this.toastr.success('Draft removido.', 'Sucesso');

          if (this.rows.length === 0 && this.skip > 0) {
            this.skip = Math.max(0, this.skip - this.limit);
            this.loadDrafts();
          }
        },
        error: (error: HttpErrorResponse) => {
          row.isRemoving = false;
          this.toastr.danger(this.buildErrorMessage('Falha ao remover draft.', error), 'Erro');
        }
      });
  }

  formatMoney(cents: number): string {
    return formatBrlFromCents(cents);
  }

  openPublishWizard(row: MyProductRow): void {
    if (!row.hasProductVariant) {
      this.toastr.warning('Catalogo incompleto: SKU sem variante cadastrada.', 'Publicacoes');
      return;
    }

    const variantSku = (row.resolvedVariantSku ?? row.productSku).trim().toUpperCase();

    void this.router.navigate(['/client/publications/new'], {
      queryParams: {
        channel: 'mercadolivre',
        variantSku
      },
      state: {
        variantSku,
        titleSuggestion: row.productName,
        catalogPrice: row.catalogPrice,
        catalogPriceScale: 'brl',
        images: row.images,
        gtin: row.gtin,
        ncm: row.ncm,
        origin: row.origin,
        description: row.description
      }
    });
  }

  openLinkExisting(row: MyProductRow): void {
    this.linkProduct = row;
    this.linkQuery = row.productName;
    this.linkCandidates = [];
    this.linkError = null;
    this.linkCandidatesLoading = true;
    this.mercadoLivreService.status().pipe(takeUntil(this.destroy$)).subscribe({
      next: (status) => {
        const connection = status.connections[0];
        if (!connection) {
          this.linkCandidatesLoading = false;
          this.linkError = 'Conecte uma conta do Mercado Livre antes de vincular um anúncio.';
          return;
        }
        this.linkSellerId = connection.sellerId;
        this.searchLinkCandidates();
      },
      error: (error: HttpErrorResponse) => {
        this.linkCandidatesLoading = false;
        this.linkError = this.buildErrorMessage('Não foi possível consultar a integração.', error);
      }
    });
  }

  closeLinkExisting(): void {
    if (this.linkSavingKey) return;
    this.linkProduct = null;
    this.linkCandidates = [];
    this.linkError = null;
  }

  searchLinkCandidates(): void {
    if (!this.linkProduct || !this.linkSellerId) return;
    this.linkCandidatesLoading = true;
    this.linkError = null;
    this.mercadoLivreService.listSellerListings(this.linkSellerId, this.linkQuery)
      .pipe(finalize(() => (this.linkCandidatesLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (items) => { this.linkCandidates = items; },
        error: (error: HttpErrorResponse) => {
          this.linkError = this.buildErrorMessage('Não foi possível carregar seus anúncios.', error);
        }
      });
  }

  linkCandidateKey(candidate: MercadoLivreLinkCandidateResult): string {
    return `${candidate.itemId}_${candidate.variationId ?? 'root'}`;
  }

  confirmLinkCandidate(candidate: MercadoLivreLinkCandidateResult): void {
    const row = this.linkProduct;
    if (!row || this.linkSavingKey) return;
    const variantSku = (row.resolvedVariantSku ?? row.productSku).trim().toUpperCase();
    if (candidate.alreadyMapped && candidate.mappedSku !== variantSku
        && !window.confirm(`Este anúncio está vinculado a ${candidate.mappedSku}. Deseja remapear para ${variantSku}?`)) return;

    const key = this.linkCandidateKey(candidate);
    this.linkSavingKey = key;
    this.marketplaceMappingsService.createMapping({
      provider: 'MercadoLivre',
      sellerId: candidate.sellerId,
      externalItemId: candidate.itemId,
      externalVariationId: candidate.variationId ?? null,
      selectedCatalogSku: variantSku
    }).pipe(finalize(() => (this.linkSavingKey = null)), takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.toastr.success(
          result.ordersAffected > 0
            ? `Anúncio vinculado. ${result.ordersAffected} pedido(s) pendente(s) atualizado(s).`
            : 'Anúncio vinculado com sucesso.',
          'Mercado Livre'
        );
        this.linkSavingKey = null;
        this.closeLinkExisting();
        this.loadDrafts();
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.danger(this.buildErrorMessage('Falha ao vincular anúncio.', error), 'Mercado Livre');
      }
    });
  }

  manageListing(mapping: MarketplaceMappingResult): void {
    this.listingLoadingId = mapping.id;
    this.listingWorkspace = null;
    this.marketplaceMappingsService.getListing(mapping.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (workspace) => {
        this.listingLoadingId = null;
        this.listingWorkspace = workspace;
        this.editListingTitle = workspace.listing.title;
        this.editListingPrice = workspace.listing.price;
        this.editListingDescription = '';
        this.listingReviewing = false;
        this.pendingListingChanges = null;
        this.pendingListingDraftId = null;
      },
      error: (error: HttpErrorResponse) => {
        this.listingLoadingId = null;
        this.toastr.danger(this.buildErrorMessage('Nao foi possivel consultar as permissoes do anuncio.', error), 'Anuncio');
      }
    });
  }

  closeListingEditor(): void {
    this.listingWorkspace = null;
    this.listingReviewing = false;
    this.pendingListingChanges = null;
    this.pendingListingDraftId = null;
  }

  listingFieldEditable(field: string): boolean {
    return !!this.listingWorkspace?.capabilities.fields?.[field]?.editable;
  }

  listingFieldReason(field: string): string {
    return this.listingWorkspace?.capabilities.fields?.[field]?.reason ?? '';
  }

  prepareListingReview(): void {
    const workspace = this.listingWorkspace;
    if (!workspace) return;
    const changes: {
      evaluationHash: string;
      mappingVersion: number;
      title?: string;
      price?: number;
      description?: string;
    } = {
      evaluationHash: workspace.capabilities.evaluationHash,
      mappingVersion: workspace.capabilities.mappingVersion
    };
    if (this.listingFieldEditable('title') && this.editListingTitle.trim() !== workspace.listing.title) {
      changes.title = this.editListingTitle.trim();
    }
    if (this.listingFieldEditable('price') && this.editListingPrice != null && this.editListingPrice !== workspace.listing.price) {
      changes.price = Number(this.editListingPrice);
    }
    if (this.listingFieldEditable('description') && this.editListingDescription.trim()) {
      changes.description = this.editListingDescription.trim();
    }
    if (changes.title === undefined && changes.price === undefined && changes.description === undefined) {
      this.toastr.info('Nenhuma alteracao para sincronizar.', 'Anuncio');
      return;
    }
    this.listingDraftSaving = true;
    this.marketplaceMappingsService.saveListingChangeDraft(workspace.listing.mappingId, changes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (draft) => {
          this.listingDraftSaving = false;
          this.pendingListingChanges = draft.changes;
          this.pendingListingDraftId = draft.draftId;
          this.listingReviewing = true;
          this.toastr.success('Rascunho salvo. Revise antes de sincronizar.', 'Anuncio');
        },
        error: (error: HttpErrorResponse) => {
          this.listingDraftSaving = false;
          if (error.status === 409) {
            this.toastr.warning('As permissoes expiraram. Reabra o anuncio e tente novamente.', 'Concorrencia');
          } else {
            this.toastr.danger(this.buildErrorMessage('Falha ao salvar o rascunho.', error), 'Anuncio');
          }
        }
      });
  }

  cancelListingReview(): void {
    this.listingReviewing = false;
    this.pendingListingChanges = null;
    this.pendingListingDraftId = null;
  }

  saveListingChanges(): void {
    const workspace = this.listingWorkspace;
    const changes = this.pendingListingChanges;
    const draftId = this.pendingListingDraftId;
    if (!workspace || !changes || !draftId || this.listingSaving) return;
    this.listingSaving = true;
    this.marketplaceMappingsService.applyListingChangeDraft(workspace.listing.mappingId, draftId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.listingSaving = false;
          this.listingWorkspace = updated;
          this.editListingTitle = updated.listing.title;
          this.editListingPrice = updated.listing.price;
          this.editListingDescription = '';
          this.listingReviewing = false;
          this.pendingListingChanges = null;
          this.pendingListingDraftId = null;
          this.toastr.success('Alteracoes sincronizadas e auditadas.', 'Mercado Livre');
        },
        error: (error: HttpErrorResponse) => {
          this.listingSaving = false;
          if (error.status === 409) {
            this.toastr.warning('O anuncio mudou. Reabra o editor para carregar as permissoes atuais.', 'Concorrencia');
          } else {
            this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar o anuncio.', error), 'Mercado Livre');
          }
        }
      });
  }

  mlBadgeClass(status: string): string {
    const normalized = (status ?? '').trim().toLowerCase();
    if (normalized === 'error') {
      return 'badge-error';
    }

    if (normalized === 'draft' || normalized === 'publishing' || normalized === 'valid') {
      return 'badge-draft';
    }

    if (normalized === 'published') {
      return 'badge-published';
    }

    return 'badge-none';
  }

  resolveImageUrl(url?: string | null): string | null {
    const raw = (url ?? '').trim();
    if (!raw) {
      return null;
    }

    if (/^http:\/\/(?:[^/]+\.)?mlstatic\.com\//i.test(raw)) {
      return `https://${raw.slice('http://'.length)}`;
    }

    if (raw.startsWith('//')) {
      return `https:${raw}`;
    }

    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }

    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  private loadDrafts(): void {
    this.loading = true;
    this.errorMessage = null;

    this.myProductsService
      .listMyProducts(this.skip, this.limit, this.searchControl.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.rows = (response.items ?? []).map((draft) => this.toRow(draft));
          this.total = response.total ?? 0;
          this.loadMappings();
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar Meus Produtos. Tente novamente.', error);
        }
      });
  }

  private toRow(draft: MyProductDraft): MyProductRow {
    return {
      id: draft.id,
      productSku: draft.productSku,
      productName: draft.productName,
      thumbnailUrl: draft.thumbnailUrl,
      pricingMode: draft.pricingMode,
      markupPercent: draft.markupPercent,
      fixedPriceCents: draft.fixedPriceCents,
      catalogPriceCentsSnapshot: draft.catalogPriceCentsSnapshot,
      finalPriceCentsSnapshot: draft.finalPriceCentsSnapshot,
      rowVersion: draft.rowVersion,
      isSaving: false,
      isRemoving: false,
      isDirty: false,
      editPricingMode: draft.pricingMode,
      editMarkupPercent: draft.markupPercent,
      editFixedPriceCents: draft.fixedPriceCents,
      mlOverallStatus: draft.mlOverallStatus ?? 'None',
      mlPublishedCount: draft.mlPublishedCount ?? 0,
      mlDraftCount: draft.mlDraftCount ?? 0,
      mlErrorCount: draft.mlErrorCount ?? 0,
      hasProductVariant: draft.hasProductVariant ?? false,
      variantStatus: draft.variantStatus ?? 'Missing',
      resolvedVariantSku: draft.resolvedVariantSku ?? null,
      availableStock: draft.availableStock ?? null,
      stockSource: draft.stockSource ?? null,
      description: draft.description ?? null,
      images: [...(draft.images ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((item, index) => ({
          url: (item.url ?? '').trim(),
          position: index + 1
        }))
        .filter((item) => !!item.url),
      gtin: draft.gtin ?? null,
      ncm: draft.ncm ?? null,
      origin: draft.origin ?? null,
      purchaseCost: draft.purchaseCost ?? null,
      catalogPrice: draft.catalogPrice ?? null,
      mappings: []
    };
  }

  private loadMappings(): void {
    this.marketplaceMappingsService.listMappings('MercadoLivre').pipe(takeUntil(this.destroy$)).subscribe({
      next: (mappings) => {
        for (const row of this.rows) {
          const skus = new Set([row.productSku, row.resolvedVariantSku].filter((item): item is string => !!item).map((item) => item.toUpperCase()));
          row.mappings = mappings.filter((mapping) => skus.has((mapping.sabrVariantSku ?? '').toUpperCase()));
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toastr.warning('Produtos carregados, mas os anuncios vinculados nao puderam ser consultados.', 'Sincronizacao');
      }
    });
  }

  private applyDraft(row: MyProductRow, draft: MyProductDraft): void {
    row.pricingMode = draft.pricingMode;
    row.markupPercent = draft.markupPercent;
    row.fixedPriceCents = draft.fixedPriceCents;
    row.catalogPriceCentsSnapshot = draft.catalogPriceCentsSnapshot;
    row.finalPriceCentsSnapshot = draft.finalPriceCentsSnapshot;
    row.rowVersion = draft.rowVersion;
    row.editPricingMode = draft.pricingMode;
    row.editMarkupPercent = draft.markupPercent;
    row.editFixedPriceCents = draft.fixedPriceCents;
    row.resolvedVariantSku = draft.resolvedVariantSku ?? row.resolvedVariantSku ?? null;
    row.availableStock = draft.availableStock ?? row.availableStock ?? null;
    row.stockSource = draft.stockSource ?? row.stockSource ?? null;
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private parseExternalCost(value: number | string | null): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value == null) return null;
    let normalized = value.trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (!normalized) return null;
    if (normalized.includes(',') && normalized.includes('.')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else normalized = normalized.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toIntegerOrNull(value: unknown): number | null {
    const numeric = this.toNumberOrNull(value);
    if (numeric == null) {
      return null;
    }

    return Math.trunc(numeric);
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    return traceId ? `${message} (traceId: ${traceId})` : message;
  }
}
