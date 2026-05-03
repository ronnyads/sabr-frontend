import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbButtonModule, NbInputModule, NbSpinnerModule, NbToastrService } from '@nebular/theme';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { AdminCatalogsService, AdminCatalogResult, AdminCatalogUpsertRequest } from '../core/services/admin-catalogs.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';

@Component({
  selector: 'app-admin-global-catalogs',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NbButtonModule, NbInputModule, NbSpinnerModule, UiStateComponent, PageHeaderComponent],
  template: `
    <section class="phub-page admin-global-catalogs-page">
      <ng-template #headerActions>
        <button nbButton status="primary" size="small" (click)="openCreate()">Novo Catálogo</button>
      </ng-template>

      <app-page-header
        [title]="'Catálogos'"
        [subtitle]="'Catálogos globais da plataforma. Associe produtos e vincule a planos de clientes.'"
        [actionsTemplate]="headerActions"
      ></app-page-header>

      <!-- Inline form -->
      <div class="phub-card panel form-panel" *ngIf="formOpen">
        <h4 class="form-title">{{ editingId ? 'Editar Catálogo' : 'Novo Catálogo' }}</h4>
        <form [formGroup]="form" (ngSubmit)="saveCatalog()">
          <div class="form-row">
            <div class="form-field flex-grow">
              <label>Nome *</label>
              <input nbInput fullWidth formControlName="name" placeholder="Ex: Catálogo Geral" />
              <span class="field-error" *ngIf="form.controls.name.invalid && form.controls.name.touched">
                Nome é obrigatório (máx. 200 caracteres)
              </span>
            </div>
            <div class="form-field status-field">
              <label>Status</label>
              <select formControlName="isActive" class="status-select">
                <option [value]="true">Ativo</option>
                <option [value]="false">Inativo</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field flex-grow">
              <label>Descrição</label>
              <input nbInput fullWidth formControlName="description" placeholder="Descrição opcional" />
            </div>
          </div>
          <div class="form-error" *ngIf="formError">{{ formError }}</div>
          <div class="form-actions">
            <button type="submit" nbButton status="primary" size="small" [disabled]="saving">
              {{ saving ? 'Salvando...' : 'Salvar' }}
            </button>
            <button type="button" nbButton status="basic" size="small" (click)="cancelForm()" [disabled]="saving">Cancelar</button>
          </div>
        </form>
      </div>

      <!-- Filters -->
      <div class="phub-card panel filters-panel">
        <div class="filter-row">
          <input nbInput placeholder="Buscar por nome..." [formControl]="searchControl" />
          <select [formControl]="statusControl" class="status-select">
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <button nbButton status="basic" size="small" (click)="reset()">Limpar</button>
        </div>
      </div>

      <div class="phub-card panel">
        <app-ui-state
          [loading]="loading"
          [empty]="!loading && catalogs.length === 0"
          [errorMessage]="errorMessage"
          emptyTitle="Nenhum catálogo encontrado"
          emptyDescription="Clique em 'Novo Catálogo' para criar o primeiro catálogo da plataforma."
          (retry)="loadCatalogs()"
        ></app-ui-state>

        <div class="table-wrapper" *ngIf="!loading && !errorMessage && catalogs.length > 0">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th style="text-align: center;">Produtos</th>
                <th style="text-align: center;">Planos</th>
                <th>Status</th>
                <th style="width: 140px;">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let catalog of catalogs">
                <td><strong>{{ catalog.name }}</strong></td>
                <td class="description-cell">{{ catalog.description || '—' }}</td>
                <td style="text-align: center;">{{ catalog.productCount }}</td>
                <td style="text-align: center;">{{ catalog.planCount }}</td>
                <td>
                  <span class="badge" [class.active]="catalog.isActive" [class.inactive]="!catalog.isActive">
                    {{ catalog.isActive ? 'Ativo' : 'Inativo' }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button nbButton size="tiny" status="info" (click)="openEdit(catalog)">Editar</button>
                  <button nbButton size="tiny" status="danger" (click)="deactivate(catalog)" [disabled]="!catalog.isActive">Inativar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="!loading && !errorMessage && catalogs.length > 0" class="pagination-info">
          Exibindo {{ catalogs.length }} de {{ total }} catálogos
        </div>
      </div>
    </section>
  `,
  styles: [`
    .form-panel {
      margin-bottom: 1.5rem;

      .form-title {
        margin: 0 0 1rem;
        font-size: 1rem;
        font-weight: 600;
      }

      .form-row {
        display: flex;
        gap: 1rem;
        margin-bottom: 0.75rem;
        align-items: flex-start;
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;

        label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #555;
        }

        &.flex-grow { flex: 1; }

        &.status-field { min-width: 120px; }

        .field-error {
          font-size: 0.75rem;
          color: #e53935;
        }
      }

      .status-select {
        padding: 0.5rem;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
      }

      .form-error {
        color: #e53935;
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
      }

      .form-actions {
        display: flex;
        gap: 0.5rem;
      }
    }

    .filters-panel {
      margin-bottom: 1.5rem;

      .filter-row {
        display: flex;
        gap: 1rem;
        align-items: center;

        input { flex: 1; min-width: 200px; }

        .status-select {
          padding: 0.5rem;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          min-width: 130px;
        }
      }
    }

    .table-wrapper {
      overflow-x: auto;

      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;

        thead {
          background-color: #f5f5f5;
          border-bottom: 2px solid #e0e0e0;

          th {
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            color: #333;
          }
        }

        tbody tr {
          border-bottom: 1px solid #e0e0e0;
          &:hover { background-color: #fafafa; }

          td {
            padding: 0.875rem 1rem;
            vertical-align: middle;

            &.description-cell {
              color: #666;
              max-width: 300px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            &.actions-cell {
              display: flex;
              gap: 0.375rem;
              align-items: center;
            }

            .badge {
              display: inline-block;
              padding: 0.25rem 0.75rem;
              border-radius: 20px;
              font-size: 0.75rem;
              font-weight: 600;

              &.active { background-color: #e8f5e9; color: #2e7d32; }
              &.inactive { background-color: #f5f5f5; color: #666; }
            }
          }
        }
      }
    }

    .pagination-info {
      text-align: right;
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #666;
    }
  `]
})
export class AdminGlobalCatalogs implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', [Validators.maxLength(600)]],
    isActive: [true]
  });

  catalogs: AdminCatalogResult[] = [];
  loading = false;
  errorMessage: string | null = null;
  total = 0;

  formOpen = false;
  formError: string | null = null;
  editingId: string | null = null;
  saving = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly catalogsService: AdminCatalogsService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.tenantContext.clear();
    this.loadCatalogs();

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadCatalogs());

    this.statusControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.loadCatalogs());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadCatalogs(): void {
    this.loading = true;
    this.errorMessage = null;

    const search = this.searchControl.value || undefined;
    const statusValue = this.statusControl.value;
    const isActive = statusValue === '' ? null : statusValue === 'true';

    this.catalogsService.list(0, 100, search, isActive).subscribe({
      next: (response) => {
        this.catalogs = response.items;
        this.total = response.total;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Erro ao carregar catálogos. Tente novamente.';
      }
    });
  }

  openCreate(): void {
    this.formOpen = true;
    this.formError = null;
    this.editingId = null;
    this.form.reset({ name: '', description: '', isActive: true });
  }

  openEdit(catalog: AdminCatalogResult): void {
    this.formOpen = true;
    this.formError = null;
    this.editingId = catalog.id;
    this.form.reset({ name: catalog.name, description: catalog.description ?? '', isActive: catalog.isActive });
  }

  cancelForm(): void {
    this.formOpen = false;
    this.formError = null;
    this.editingId = null;
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

    const request$ = this.editingId
      ? this.catalogsService.update(this.editingId, request)
      : this.catalogsService.create(request);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.toastr.success(this.editingId ? 'Catálogo atualizado.' : 'Catálogo criado.', 'Sucesso');
        this.loadCatalogs();
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
        this.formError = apiMessage || 'Falha ao salvar catálogo.';
      }
    });
  }

  deactivate(catalog: AdminCatalogResult): void {
    if (!catalog.isActive || !confirm(`Inativar catálogo "${catalog.name}"?`)) {
      return;
    }

    this.catalogsService.deactivate(catalog.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Catálogo inativado.', 'Sucesso');
        this.loadCatalogs();
      },
      error: () => {
        this.toastr.danger('Falha ao inativar catálogo.', 'Erro');
      }
    });
  }

  reset(): void {
    this.searchControl.reset('');
    this.statusControl.reset('');
  }
}
