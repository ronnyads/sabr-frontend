import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NbButtonModule,
  NbInputModule,
  NbSpinnerModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, combineLatest, debounceTime, distinctUntilChanged, forkJoin, startWith, takeUntil } from 'rxjs';
import {
  AdminCatalogDetailResult,
  AdminCatalogResult,
  AdminCatalogUpsertRequest,
  AdminCatalogsService
} from '../core/services/admin-catalogs.service';
import { AdminPlanResult, AdminPlansService } from '../core/services/admin-plans.service';
import { AdminProductResult, AdminProductsService } from '../core/services/admin-products.service';
import { normalizeSkuUppercase } from '../core/utils/sku.utils';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SearchToolbarComponent, SearchToolbarFilter } from '../shared/search-toolbar/search-toolbar.component';
import { RowActionMenuAction, RowActionsMenuComponent } from '../shared/row-actions-menu/row-actions-menu.component';

type ActiveFilter = 'all' | 'active' | 'inactive';
type LinkMode = 'products' | 'plans' | null;

@Component({
  selector: 'app-admin-catalogs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbButtonModule,
    NbInputModule,
    NbSpinnerModule,
    UiStateComponent,
    PageHeaderComponent,
    SearchToolbarComponent,
    RowActionsMenuComponent
  ],
  templateUrl: './admin-catalogs.html',
  styleUrls: ['./admin-catalogs.scss']
})
export class AdminCatalogs implements OnInit, OnDestroy {
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly activeFilterControl = new FormControl<ActiveFilter>('all', { nonNullable: true });
  readonly toolbarFilters: SearchToolbarFilter[] = [
    {
      id: 'status',
      label: 'Status',
      value: 'all',
      options: [
        { label: 'Todos', value: 'all' },
        { label: 'Ativos', value: 'active' },
        { label: 'Inativos', value: 'inactive' }
      ]
    }
  ];
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.maxLength(600)]],
    isActive: [true]
  });

  tenantId = '';
  catalogs: AdminCatalogResult[] = [];
  catalogActionsById: Record<string, RowActionMenuAction[]> = {};

  loading = false;
  errorMessage: string | null = null;

  formOpen = false;
  formError: string | null = null;
  editingCatalogId: string | null = null;
  saving = false;
  openCreateOnLoad = false;

  linksMode: LinkMode = null;
  linksCatalog: AdminCatalogDetailResult | null = null;
  linksLoading = false;
  linksSaving = false;
  linksError: string | null = null;

  availableProducts: AdminProductResult[] = [];
  availablePlans: AdminPlanResult[] = [];
  selectedProductSkus: string[] = [];
  selectedPlanIds: string[] = [];

  skip = 0;
  limit = 20;
  total = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly catalogsService: AdminCatalogsService,
    private readonly plansService: AdminPlansService,
    private readonly productsService: AdminProductsService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const routeTenant = (params.get('tenantId') ?? '').trim().toLowerCase();
      if (!routeTenant) {
        this.toastr.warning('Selecione um cliente antes de abrir Catálogos.', 'Cliente obrigatório');
        void this.router.navigate(['/clients']);
        return;
      }

      this.tenantId = routeTenant;
      this.tenantContext.set(this.tenantId);
      this.skip = 0;
      this.closeLinks();
      const action = this.route.snapshot.queryParamMap.get('action');
      this.openCreateOnLoad = action === 'new';
      if (this.openCreateOnLoad) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
      this.loadCatalogs();
    });

    combineLatest([
      this.searchControl.valueChanges.pipe(startWith(this.searchControl.value), debounceTime(300), distinctUntilChanged()),
      this.activeFilterControl.valueChanges.pipe(startWith(this.activeFilterControl.value), distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.tenantId) {
          return;
        }

        this.updateToolbarFilters();
        this.skip = 0;
        this.loadCatalogs();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.catalogs.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  trackCatalog(_: number, item: AdminCatalogResult): string {
    return item.id;
  }

  trackAvailableProduct(_: number, item: AdminProductResult): string {
    return item.sku;
  }

  trackAvailablePlan(_: number, item: AdminPlanResult): string {
    return item.id;
  }

  onToolbarSearchChange(value: string): void {
    const nextValue = value ?? '';
    if (nextValue === this.searchControl.value) {
      return;
    }

    this.searchControl.setValue(nextValue);
  }

  onToolbarFilterChange(change: { id: string; value: string }): void {
    if (change.id !== 'status') {
      return;
    }

    const nextValue = this.normalizeActiveFilter(change.value);
    const currentValue = this.activeFilterControl.value;
    if (this.normalizeFilterValue(nextValue) === this.normalizeFilterValue(currentValue)) {
      return;
    }

    this.activeFilterControl.setValue(nextValue, { emitEvent: false });
    this.updateToolbarFilters();
    this.skip = 0;
    this.loadCatalogs();
  }

  clearToolbar(): void {
    let changed = false;

    if (this.searchControl.value !== '') {
      this.searchControl.setValue('', { emitEvent: false });
      changed = true;
    }

    if (this.activeFilterControl.value !== 'all') {
      this.activeFilterControl.setValue('all', { emitEvent: false });
      changed = true;
    }

    this.updateToolbarFilters();
    if (changed) {
      this.skip = 0;
      this.loadCatalogs();
    }
  }

  onCatalogAction(catalog: AdminCatalogResult, actionId: string): void {
    switch (actionId) {
      case 'edit':
        this.openEdit(catalog);
        return;
      case 'products':
        this.openProductsLinks(catalog);
        return;
      case 'plans':
        this.openPlansLinks(catalog);
        return;
      case 'deactivate':
        this.deactivate(catalog);
        return;
      default:
        return;
    }
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = null;
    this.editingCatalogId = null;
    this.form.reset({
      name: '',
      description: '',
      isActive: true
    });
  }

  openEdit(catalog: AdminCatalogResult): void {
    this.formOpen = true;
    this.formError = null;
    this.editingCatalogId = catalog.id;
    this.form.reset({
      name: catalog.name,
      description: catalog.description ?? '',
      isActive: catalog.isActive
    });
  }

  cancelForm(): void {
    this.formOpen = false;
    this.formError = null;
    this.editingCatalogId = null;
  }

  saveCatalog(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const request: AdminCatalogUpsertRequest = {
      name: raw.name.trim(),
      description: raw.description.trim() || null,
      isActive: raw.isActive
    };

    this.saving = true;
    this.formError = null;

    const request$ = this.editingCatalogId
      ? this.catalogsService.update(this.editingCatalogId, request)
      : this.catalogsService.create(request);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.toastr.success('Catalogo salvo com sucesso.', 'Sucesso');
        this.loadCatalogs();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.formError = this.buildErrorMessage('Falha ao salvar catalogo.', error);
      }
    });
  }

  deactivate(catalog: AdminCatalogResult): void {
    if (!catalog.isActive) {
      return;
    }

    if (!confirm(`Inativar catalogo ${catalog.name}?`)) {
      return;
    }

    this.catalogsService
      .deactivate(catalog.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Catalogo inativado.', 'Sucesso');
          this.loadCatalogs();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao inativar catalogo.', error), 'Erro');
        }
      });
  }

  openProductsLinks(catalog: AdminCatalogResult): void {
    this.linksMode = 'products';
    this.linksCatalog = null;
    this.linksError = null;
    this.linksLoading = true;

    forkJoin({
      detail: this.catalogsService.getById(catalog.id),
      products: this.productsService.list(0, 200, undefined, true)
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ detail, products }) => {
          this.linksLoading = false;
          this.linksCatalog = detail;
          this.availableProducts = products.items ?? [];
          this.selectedProductSkus = [...detail.productSkus];
        },
        error: (error: HttpErrorResponse) => {
          this.linksLoading = false;
          this.linksError = this.buildErrorMessage('Falha ao carregar vinculos de produtos.', error);
        }
      });
  }

  openPlansLinks(catalog: AdminCatalogResult): void {
    this.linksMode = 'plans';
    this.linksCatalog = null;
    this.linksError = null;
    this.linksLoading = true;

    forkJoin({
      detail: this.catalogsService.getById(catalog.id),
      plans: this.plansService.list(0, 200, undefined, true)
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ detail, plans }) => {
          this.linksLoading = false;
          this.linksCatalog = detail;
          this.availablePlans = plans.items ?? [];
          this.selectedPlanIds = [...detail.planIds];
        },
        error: (error: HttpErrorResponse) => {
          this.linksLoading = false;
          this.linksError = this.buildErrorMessage('Falha ao carregar vinculos de planos.', error);
        }
      });
  }

  closeLinks(): void {
    this.linksMode = null;
    this.linksCatalog = null;
    this.linksLoading = false;
    this.linksSaving = false;
    this.linksError = null;
    this.availableProducts = [];
    this.availablePlans = [];
    this.selectedProductSkus = [];
    this.selectedPlanIds = [];
  }

  toggleProductSku(sku: string, event: Event): void {
    const normalizedSku = normalizeSkuUppercase(sku);
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    if (checked) {
      if (!this.selectedProductSkus.includes(normalizedSku)) {
        this.selectedProductSkus = [...this.selectedProductSkus, normalizedSku];
      }
      return;
    }

    this.selectedProductSkus = this.selectedProductSkus.filter((item) => item !== normalizedSku);
  }

  togglePlanId(planId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    if (checked) {
      if (!this.selectedPlanIds.includes(planId)) {
        this.selectedPlanIds = [...this.selectedPlanIds, planId];
      }
      return;
    }

    this.selectedPlanIds = this.selectedPlanIds.filter((item) => item !== planId);
  }

  isProductSelected(sku: string): boolean {
    return this.selectedProductSkus.includes(normalizeSkuUppercase(sku));
  }

  isPlanSelected(planId: string): boolean {
    return this.selectedPlanIds.includes(planId);
  }

  saveLinks(): void {
    if (!this.linksCatalog || !this.linksMode || this.linksSaving) {
      return;
    }

    this.linksSaving = true;
    this.linksError = null;

    const request$ = this.linksMode === 'products'
      ? this.catalogsService.replaceProducts(
          this.linksCatalog.id,
          [...new Set(this.selectedProductSkus.map((item) => normalizeSkuUppercase(item)))]
        )
      : this.catalogsService.replacePlans(this.tenantId, this.linksCatalog.id, [...new Set(this.selectedPlanIds)]);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (detail) => {
        this.linksSaving = false;
        this.linksCatalog = detail;

        if (this.linksMode === 'products') {
          this.selectedProductSkus = [...detail.productSkus];
        } else {
          this.selectedPlanIds = [...detail.planIds];
        }

        this.toastr.success('Vinculos atualizados com sucesso.', 'Sucesso');
        this.loadCatalogs();
      },
      error: (error: HttpErrorResponse) => {
        this.linksSaving = false;
        this.linksError = this.buildErrorMessage('Falha ao salvar vinculos.', error);
      }
    });
  }

  previousPage(): void {
    if (!this.hasPreviousPage) {
      return;
    }

    this.skip = Math.max(this.skip - this.limit, 0);
    this.loadCatalogs();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadCatalogs();
  }

  retry(): void {
    this.loadCatalogs();
  }

  private loadCatalogs(): void {
    if (!this.tenantId) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    const activeFilter = this.activeFilterControl.value;
    const isActive = activeFilter === 'all' ? null : activeFilter === 'active';

    this.catalogsService
      .list(this.skip, this.limit, this.searchControl.value, isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.catalogs = response.items ?? [];
          this.rebuildCatalogActions();
          this.total = response.total ?? 0;
          this.loading = false;
          if (this.openCreateOnLoad) {
            this.openCreateOnLoad = false;
            this.openCreate();
          }
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar catalogos.', error);
        }
      });
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');
    const invalidSkus = this.readInvalidList(error.error?.errors, 'invalidSkus');
    const invalidPlanIds = this.readInvalidList(error.error?.errors, 'invalidPlanIds');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    const invalidSuffix = [
      invalidSkus.length > 0 ? `SKUs invalidos: ${invalidSkus.join(', ')}` : null,
      invalidPlanIds.length > 0 ? `Planos invalidos: ${invalidPlanIds.join(', ')}` : null
    ]
      .filter((item): item is string => !!item)
      .join(' | ');

    const composed = invalidSuffix ? `${message}. ${invalidSuffix}` : message;
    return traceId ? `${composed} (traceId: ${traceId})` : composed;
  }

  private readInvalidList(source: unknown, propertyName: string): string[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    const value = (source as Record<string, unknown>)[propertyName];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private updateToolbarFilters(): void {
    this.toolbarFilters[0].value = this.activeFilterControl.value;
  }

  private normalizeFilterValue(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  private normalizeActiveFilter(value: unknown): ActiveFilter {
    const normalized = this.normalizeFilterValue(value);
    switch (normalized) {
      case 'active':
      case 'inactive':
      case 'all':
        return normalized;
      default:
        return 'all';
    }
  }

  private rebuildCatalogActions(): void {
    const nextActions: Record<string, RowActionMenuAction[]> = {};
    for (const catalog of this.catalogs) {
      nextActions[catalog.id] = this.buildCatalogActions(catalog);
    }

    this.catalogActionsById = nextActions;
  }

  private buildCatalogActions(catalog: AdminCatalogResult): RowActionMenuAction[] {
    return [
      { id: 'edit', label: 'Editar', icon: 'edit-2-outline' },
      { id: 'products', label: 'Produtos', icon: 'cube-outline' },
      { id: 'plans', label: 'Planos', icon: 'layers-outline' },
      { id: 'deactivate', label: 'Inativar', icon: 'slash-outline', danger: true, disabled: !catalog.isActive }
    ];
  }
}
