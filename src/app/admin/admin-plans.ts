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
import { Subject, combineLatest, debounceTime, distinctUntilChanged, forkJoin, map, of, startWith, switchMap, takeUntil } from 'rxjs';
import {
  AdminPlanDetailResult,
  AdminPlanResult,
  AdminPlansService,
  AdminPlanUpsertRequest,
  BillingPeriod
} from '../core/services/admin-plans.service';
import { AdminCatalogResult, AdminCatalogsService } from '../core/services/admin-catalogs.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SearchToolbarComponent, SearchToolbarFilter } from '../shared/search-toolbar/search-toolbar.component';
import { RowActionMenuAction, RowActionsMenuComponent } from '../shared/row-actions-menu/row-actions-menu.component';

type ActiveFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-admin-plans',
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
  templateUrl: './admin-plans.html',
  styleUrls: ['./admin-plans.scss']
})
export class AdminPlans implements OnInit, OnDestroy {
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
    billingPeriod: ['Monthly' as BillingPeriod],
    isActive: [true]
  });

  tenantId = '';
  plans: AdminPlanResult[] = [];
  planActionsById: Record<string, RowActionMenuAction[]> = {};
  readonly billingPeriodOptions: BillingPeriod[] = ['Monthly', 'Quarterly', 'Semiannual', 'Annual'];

  loading = false;
  errorMessage: string | null = null;

  formOpen = false;
  formError: string | null = null;
  editingPlanId: string | null = null;
  saving = false;

  linksOpen = false;
  linksLoading = false;
  linksSaving = false;
  linksError: string | null = null;
  linksPlan: AdminPlanDetailResult | null = null;
  availableCatalogs: AdminCatalogResult[] = [];
  selectedCatalogIds: string[] = [];

  skip = 0;
  limit = 20;
  total = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly plansService: AdminPlansService,
    private readonly catalogsService: AdminCatalogsService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const routeTenant = (params.get('tenantId') ?? '').trim().toLowerCase();
      if (!routeTenant) {
        this.toastr.warning('Selecione um cliente/tenant antes de abrir Planos.', 'Tenant obrigatorio');
        void this.router.navigate(['/clients']);
        return;
      }

      this.tenantId = routeTenant;
      this.tenantContext.set(this.tenantId);
      this.skip = 0;
      this.closeLinks();
      this.loadPlans();
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
        this.loadPlans();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.plans.length === 0;
  }

  get hasPreviousPage(): boolean {
    return this.skip > 0;
  }

  get hasNextPage(): boolean {
    return this.skip + this.limit < this.total;
  }

  trackPlan(_: number, item: AdminPlanResult): string {
    return item.id;
  }

  trackAvailableCatalog(_: number, item: AdminCatalogResult): string {
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
    this.loadPlans();
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
      this.loadPlans();
    }
  }

  onPlanAction(plan: AdminPlanResult, actionId: string): void {
    switch (actionId) {
      case 'edit':
        this.openEdit(plan);
        return;
      case 'catalogs':
        this.openCatalogLinks(plan);
        return;
      case 'deactivate':
        this.deactivate(plan);
        return;
      default:
        return;
    }
  }

  billingPeriodLabel(value: BillingPeriod): string {
    switch (value) {
      case 'Monthly':
        return 'Mensal';
      case 'Quarterly':
        return 'Trimestral';
      case 'Semiannual':
        return 'Semestral';
      case 'Annual':
        return 'Anual';
      default:
        return value;
    }
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = null;
    this.editingPlanId = null;
    this.form.reset({
      name: '',
      billingPeriod: 'Monthly',
      isActive: true
    });
  }

  openEdit(plan: AdminPlanResult): void {
    this.formOpen = true;
    this.formError = null;
    this.editingPlanId = plan.id;
    this.form.reset({
      name: plan.name,
      billingPeriod: plan.billingPeriod ?? 'Monthly',
      isActive: plan.isActive
    });
  }

  cancelForm(): void {
    this.formOpen = false;
    this.formError = null;
    this.editingPlanId = null;
  }

  savePlan(): void {
    if (this.form.invalid || this.saving || !this.tenantId) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const request: AdminPlanUpsertRequest = {
      name: raw.name.trim(),
      billingPeriod: raw.billingPeriod,
      isActive: raw.isActive
    };

    this.saving = true;
    this.formError = null;

    const request$ = this.editingPlanId
      ? this.plansService.update(this.tenantId, this.editingPlanId, request)
      : this.plansService.create(this.tenantId, request);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.toastr.success('Plano salvo com sucesso.', 'Sucesso');
        this.loadPlans();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.formError = this.buildErrorMessage('Falha ao salvar plano.', error);
      }
    });
  }

  deactivate(plan: AdminPlanResult): void {
    if (!this.tenantId || !plan.isActive) {
      return;
    }

    if (!confirm(`Inativar plano ${plan.name}?`)) {
      return;
    }

    this.plansService
      .deactivate(this.tenantId, plan.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Plano inativado.', 'Sucesso');
          this.loadPlans();
        },
        error: (error: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao inativar plano.', error), 'Erro');
        }
      });
  }

  openCatalogLinks(plan: AdminPlanResult): void {
    if (!this.tenantId) {
      return;
    }

    this.linksOpen = true;
    this.linksLoading = true;
    this.linksSaving = false;
    this.linksError = null;
    this.linksPlan = null;

    forkJoin({
      plan: this.plansService.getById(this.tenantId, plan.id),
      catalogs: this.loadAllActiveCatalogs()
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ plan: detail, catalogs }) => {
          this.linksLoading = false;
          this.linksPlan = detail;
          this.availableCatalogs = catalogs;
          const activeCatalogSet = new Set(catalogs.map((item) => item.id));
          const cleanedSelection = detail.catalogIds.filter((item) => activeCatalogSet.has(item));
          const removedSelection = detail.catalogIds.filter((item) => !activeCatalogSet.has(item));
          this.selectedCatalogIds = [...cleanedSelection];

          if (removedSelection.length > 0) {
            this.toastr.warning(
              `${removedSelection.length} catalogo(s) inativo(s)/invalido(s) foram removidos da selecao deste plano.`,
              'Aviso'
            );
          }
        },
        error: (error: HttpErrorResponse) => {
          this.linksLoading = false;
          this.linksError = this.buildErrorMessage('Falha ao carregar vinculos de catalogos.', error);
        }
      });
  }

  closeLinks(): void {
    this.linksOpen = false;
    this.linksLoading = false;
    this.linksSaving = false;
    this.linksError = null;
    this.linksPlan = null;
    this.availableCatalogs = [];
    this.selectedCatalogIds = [];
  }

  toggleCatalog(catalogId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    if (checked) {
      if (!this.selectedCatalogIds.includes(catalogId)) {
        this.selectedCatalogIds = [...this.selectedCatalogIds, catalogId];
      }
      return;
    }

    this.selectedCatalogIds = this.selectedCatalogIds.filter((item) => item !== catalogId);
  }

  isCatalogSelected(catalogId: string): boolean {
    return this.selectedCatalogIds.includes(catalogId);
  }

  saveCatalogLinks(): void {
    if (!this.linksPlan || !this.tenantId || this.linksSaving) {
      return;
    }

    this.linksSaving = true;
    this.linksError = null;

    const availableCatalogSet = new Set(this.availableCatalogs.map((item) => item.id));
    const sanitizedCatalogIds = [...new Set(this.selectedCatalogIds)].filter((item) => availableCatalogSet.has(item));
    const droppedCount = this.selectedCatalogIds.length - sanitizedCatalogIds.length;
    if (droppedCount > 0) {
      this.toastr.warning(
        `${droppedCount} catalogo(s) invalido(s) foram ignorados antes de salvar.`,
        'Aviso'
      );
    }

    this.plansService
      .replaceCatalogs(this.tenantId, this.linksPlan.id, sanitizedCatalogIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail) => {
          this.linksSaving = false;
          this.linksPlan = detail;
          this.selectedCatalogIds = [...detail.catalogIds];
          this.toastr.success('Vinculos atualizados com sucesso.', 'Sucesso');
          this.loadPlans();
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
    this.loadPlans();
  }

  nextPage(): void {
    if (!this.hasNextPage) {
      return;
    }

    this.skip += this.limit;
    this.loadPlans();
  }

  retry(): void {
    this.loadPlans();
  }

  private loadPlans(): void {
    if (!this.tenantId) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    const activeFilter = this.activeFilterControl.value;
    const isActive = activeFilter === 'all' ? null : activeFilter === 'active';

    this.plansService
      .list(this.tenantId, this.skip, this.limit, this.searchControl.value, isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.plans = response.items ?? [];
          this.rebuildPlanActions();
          this.total = response.total ?? 0;
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar planos.', error);
        }
      });
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');
    const invalidCatalogIds = this.readInvalidList(error.error?.errors, 'invalidCatalogIds');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    const invalidSuffix =
      invalidCatalogIds.length > 0 ? `Catalogos invalidos: ${invalidCatalogIds.join(', ')}` : '';
    const composed = invalidSuffix ? `${message}. ${invalidSuffix}` : message;
    return traceId ? `${composed} (traceId: ${traceId})` : composed;
  }

  private readInvalidList(source: unknown, propertyName: string): string[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    const sourceObject = source as Record<string, unknown>;
    const pascalCaseName = propertyName.charAt(0).toUpperCase() + propertyName.slice(1);
    const value = sourceObject[propertyName] ?? sourceObject[pascalCaseName];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private loadAllActiveCatalogs() {
    const pageSize = 200;
    return this.catalogsService.list(this.tenantId, 0, pageSize, undefined, true).pipe(
      switchMap((firstPage) => {
        const firstItems = firstPage.items ?? [];
        const total = firstPage.total ?? firstItems.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        if (totalPages <= 1) {
          return of(firstItems);
        }

        const remainingRequests = Array.from({ length: totalPages - 1 }, (_, index) =>
          this.catalogsService.list(this.tenantId, (index + 1) * pageSize, pageSize, undefined, true)
        );

        return forkJoin(remainingRequests).pipe(
          map((pages) => {
            const all = [...firstItems, ...pages.flatMap((page) => page.items ?? [])];
            const unique = new Map<string, AdminCatalogResult>();
            for (const item of all) {
              unique.set(item.id, item);
            }
            return [...unique.values()];
          })
        );
      })
    );
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

  private rebuildPlanActions(): void {
    const nextActions: Record<string, RowActionMenuAction[]> = {};
    for (const plan of this.plans) {
      nextActions[plan.id] = this.buildPlanActions(plan);
    }

    this.planActionsById = nextActions;
  }

  private buildPlanActions(plan: AdminPlanResult): RowActionMenuAction[] {
    return [
      { id: 'edit', label: 'Editar', icon: 'edit-2-outline' },
      { id: 'catalogs', label: 'Catalogos', icon: 'grid-outline' },
      { id: 'deactivate', label: 'Inativar', icon: 'slash-outline', danger: true, disabled: !plan.isActive }
    ];
  }
}
