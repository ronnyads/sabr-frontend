import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import { CatalogProduct, CatalogProductDetail, CatalogProductFacets, CatalogService } from '../core/services/catalog.service';
import { MyProductsService, PricingMode } from '../core/services/my-products.service';
import { formatBrlFromCents } from '../core/utils/money.utils';
import { normalizeSkuUppercase } from '../core/utils/sku.utils';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-client-catalog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NbButtonModule, NbIconModule, UiStateComponent],
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
  facets: CatalogProductFacets = { categories: [], brands: [], inStockCount: 0, outOfStockCount: 0, addedCount: 0, notAddedCount: 0 };
  categoryId = '';
  brand = '';
  stockStatus: 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' = 'ALL';
  membership: 'ALL' | 'ADDED' | 'NOT_ADDED' = 'ALL';
  sort = 'NAME:ASC';
  viewMode: 'grid' | 'list' = 'grid';
  detail: CatalogProductDetail | null = null;
  detailLoading = false;
  detailError: string | null = null;
  private detailReturnFocus: HTMLElement | null = null;

  private readonly addingSkus = new Set<string>();
  private readonly addedSkus = new Set<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly catalogService: CatalogService,
    private readonly myProductsService: MyProductsService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.searchControl.setValue(params.get('q') ?? '', { emitEvent: false });
    this.categoryId = params.get('category') ?? '';
    this.brand = params.get('brand') ?? '';
    this.stockStatus = (params.get('stock') as typeof this.stockStatus) || 'ALL';
    this.membership = (params.get('membership') as typeof this.membership) || 'ALL';
    this.sort = params.get('sort') ?? 'NAME:ASC';
    this.limit = this.allowedPageSize(Number(params.get('limit')));
    this.skip = Math.max(0, Number(params.get('skip')) || 0);
    this.viewMode = window.localStorage.getItem('phub.catalog.view') === 'list' ? 'list' : 'grid';
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.skip = 0;
        this.commitFilters();
      });

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
    return this.addedSkus.has(normalizeSkuUppercase(sku)) || !!this.products.find(item => item.sku === sku)?.isAddedToMyProducts;
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
          product.isAddedToMyProducts = true;
          if (this.detail?.sku === product.sku) this.detail.isAddedToMyProducts = true;
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
    this.commitFilters(false);
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.commitFilters(false);
  }

  retry(): void {
    this.loadCatalog();
  }

  onToolbarSearchChange(value: string): void {
    this.searchControl.setValue(value ?? '');
  }

  clearToolbar(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.categoryId = '';
    this.brand = '';
    this.stockStatus = 'ALL';
    this.membership = 'ALL';
    this.sort = 'NAME:ASC';
    this.skip = 0;
    this.commitFilters(false);
  }

  changeFilter(field: 'categoryId' | 'brand' | 'stockStatus' | 'membership' | 'sort', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    (this as any)[field] = value;
    this.skip = 0;
    this.commitFilters(false);
  }

  changePageSize(event: Event): void {
    this.limit = this.allowedPageSize(Number((event.target as HTMLSelectElement).value));
    this.skip = 0;
    this.commitFilters(false);
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    window.localStorage.setItem('phub.catalog.view', mode);
  }

  openDetail(product: CatalogProduct, event?: Event): void {
    this.detailReturnFocus = event?.currentTarget as HTMLElement | null;
    this.detailLoading = true;
    this.detailError = null;
    this.detail = null;
    this.catalogService.getCatalogProduct(product.sku).pipe(finalize(() => (this.detailLoading = false)), takeUntil(this.destroy$)).subscribe({
      next: detail => {
        this.detail = detail;
        setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.detail-close')?.focus());
      },
      error: error => this.detailError = this.buildErrorMessage('Falha ao carregar os detalhes do produto.', error)
    });
  }

  closeDetail(): void {
    this.detail = null;
    this.detailError = null;
    setTimeout(() => this.detailReturnFocus?.focus());
  }

  publish(product: CatalogProduct | CatalogProductDetail): void {
    void this.router.navigate(['/client/publications/new'], { queryParams: { variantSku: product.sku } });
  }

  openMyProducts(product: CatalogProduct | CatalogProductDetail): void {
    void this.router.navigate(['/client/my-products'], { queryParams: { productSku: product.sku } });
  }

  addDetailToMyProducts(): void {
    if (!this.detail) return;
    const product = this.products.find(item => item.sku === this.detail!.sku);
    if (product) this.addToMyProducts(product);
  }

  formatMoney(cents: number): string {
    return formatBrlFromCents(cents);
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

  private loadCatalog(): void {
    this.loading = true;
    this.errorMessage = null;

    this.catalogService
      .listCatalogProducts({
        skip: this.skip,
        limit: this.limit,
        search: this.searchControl.value,
        categoryId: this.categoryId,
        brand: this.brand,
        stockStatus: this.stockStatus,
        membership: this.membership,
        sort: this.sort.split(':')[0] as any,
        direction: this.sort.split(':')[1] as any
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.products = response.items ?? [];
          this.total = response.total ?? 0;
          this.facets = response.facets ?? this.facets;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar o catalogo. Tente novamente.', error);
        }
      });
  }

  private commitFilters(resetPage = true): void {
    if (resetPage) this.skip = 0;
    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: this.searchControl.value || null,
        category: this.categoryId || null,
        brand: this.brand || null,
        stock: this.stockStatus === 'ALL' ? null : this.stockStatus,
        membership: this.membership === 'ALL' ? null : this.membership,
        sort: this.sort === 'NAME:ASC' ? null : this.sort,
        limit: this.limit === 12 ? null : this.limit,
        skip: this.skip || null
      }
    });
    this.loadCatalog();
  }

  private allowedPageSize(value: number): number {
    return [12, 28, 52, 100].includes(value) ? value : 12;
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
