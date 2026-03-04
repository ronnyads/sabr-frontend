import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import {
  NbButtonModule,
  NbInputModule,
  NbSelectModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
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

  skip = 0;
  limit = 20;
  total = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly myProductsService: MyProductsService,
    private readonly toastr: NbToastrService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.loadDrafts();
      });

    this.loadDrafts();
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

    if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) {
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
          this.loading = false;
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
      catalogPrice: draft.catalogPrice ?? null
    };
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
