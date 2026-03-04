import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NbButtonModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import { CatalogProduct, CatalogService } from '../core/services/catalog.service';
import { MyProductsService, PricingMode } from '../core/services/my-products.service';
import { formatBrlFromCents } from '../core/utils/money.utils';
import { normalizeSkuUppercase } from '../core/utils/sku.utils';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SearchToolbarComponent } from '../shared/search-toolbar/search-toolbar.component';

@Component({
  selector: 'app-client-catalog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NbButtonModule, UiStateComponent, PageHeaderComponent, SearchToolbarComponent],
  templateUrl: './client-catalog.html',
  styleUrls: ['./client-catalog.scss']
})
export class ClientCatalog implements OnInit, OnDestroy {
  readonly searchControl = new FormControl('', { nonNullable: true });

  products: CatalogProduct[] = [];
  loading = false;
  errorMessage: string | null = null;

  skip = 0;
  limit = 12;
  total = 0;

  private readonly addingSkus = new Set<string>();
  private readonly addedSkus = new Set<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly catalogService: CatalogService,
    private readonly myProductsService: MyProductsService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.loadCatalog();
      });

    this.loadAddedSkus();
    this.loadCatalog();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.products.length === 0;
  }

  isAdding(sku: string): boolean {
    return this.addingSkus.has(normalizeSkuUppercase(sku));
  }

  isAdded(sku: string): boolean {
    return this.addedSkus.has(normalizeSkuUppercase(sku));
  }

  addToMyProducts(product: CatalogProduct): void {
    const normalizedSku = normalizeSkuUppercase(product.sku);
    if (this.isAdding(normalizedSku) || this.isAdded(normalizedSku)) {
      return;
    }

    this.addingSkus.add(normalizedSku);
    this.myProductsService
      .addMyProduct(
        {
          productSku: normalizedSku,
          pricingMode: PricingMode.CatalogPrice
        },
        this.generateIdempotencyKey()
      )
      .pipe(
        finalize(() => this.addingSkus.delete(normalizedSku)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.addedSkus.add(normalizedSku);
          this.toastr.success('Produto adicionado em Meus Produtos.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao adicionar produto.', error), 'Erro');
        }
      });
  }

  productBySku(_: number, product: CatalogProduct): string {
    return product.sku;
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(this.skip - this.limit, 0);
    this.loadCatalog();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadCatalog();
  }

  retry(): void {
    this.loadAddedSkus();
    this.loadCatalog();
  }

  onToolbarSearchChange(value: string): void {
    this.searchControl.setValue(value ?? '');
  }

  clearToolbar(): void {
    this.searchControl.setValue('');
  }

  formatMoney(cents: number): string {
    return formatBrlFromCents(cents);
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

  private loadCatalog(): void {
    this.loading = true;
    this.errorMessage = null;

    this.catalogService
      .listCatalogProducts(this.skip, this.limit, this.searchControl.value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.products = response.items ?? [];
          this.total = response.total ?? 0;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar o catalogo. Tente novamente.', error);
        }
      });
  }

  private loadAddedSkus(): void {
    this.myProductsService
      .listMyProducts(0, 200, undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.addedSkus.clear();
          for (const item of response.items ?? []) {
            this.addedSkus.add(normalizeSkuUppercase(item.productSku));
          }
        },
        error: () => {
          // Listing catalog must continue even if draft fetch fails.
        }
      });
  }

  private generateIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
