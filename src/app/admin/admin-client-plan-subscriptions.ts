import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  NbButtonModule,
  NbCardModule,
  NbSpinnerModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { AdminClientPlanSubscriptionsService, ClientPlanSubscriptionItem } from '../core/services/admin-client-plan-subscriptions.service';
import { AdminPlanResult, AdminPlansService, BillingPeriod } from '../core/services/admin-plans.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-admin-client-plan-subscriptions',
  standalone: true,
  imports: [
    CommonModule,
    NbCardModule,
    NbButtonModule,
    NbSpinnerModule,
    UiStateComponent
  ],
  templateUrl: './admin-client-plan-subscriptions.html',
  styleUrls: ['./admin-client-plan-subscriptions.scss']
})
export class AdminClientPlanSubscriptions implements OnInit, OnDestroy {
  tenantId = '';
  clientId = '';
  plans: AdminPlanResult[] = [];
  selectedPlanIds: string[] = [];

  loading = false;
  saving = false;
  errorMessage: string | null = null;

  private readonly subscriptionsByPlanId = new Map<string, ClientPlanSubscriptionItem>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly plansService: AdminPlansService,
    private readonly subscriptionsService: AdminClientPlanSubscriptionsService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const tenantId = (params.get('tenantId') ?? '').trim().toLowerCase();
      const clientId = (params.get('clientId') ?? '').trim();

      if (!tenantId || !clientId) {
        this.toastr.warning('Tenant e cliente sao obrigatorios para gerenciar assinaturas.', 'Contexto ausente');
        void this.router.navigate(['/clients']);
        return;
      }

      this.tenantId = tenantId;
      this.clientId = clientId;
      this.tenantContext.set(this.tenantId);
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && this.plans.length === 0;
  }

  trackPlan(_: number, item: AdminPlanResult): string {
    return item.id;
  }

  isSelected(planId: string): boolean {
    return this.selectedPlanIds.includes(planId);
  }

  togglePlan(planId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
    if (checked) {
      if (!this.selectedPlanIds.includes(planId)) {
        this.selectedPlanIds = [...this.selectedPlanIds, planId];
      }
      return;
    }

    this.selectedPlanIds = this.selectedPlanIds.filter((item) => item !== planId);
  }

  save(): void {
    if (!this.tenantId || !this.clientId || this.saving) {
      return;
    }

    this.saving = true;
    this.errorMessage = null;
    const deduped = [...new Set(this.selectedPlanIds)];

    this.subscriptionsService
      .replaceSet(this.tenantId, this.clientId, deduped)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.saving = false;
          this.selectedPlanIds = response.items.map((item) => item.planId);
          this.syncSubscriptionMap(response.items);
          this.toastr.success('Assinaturas de planos atualizadas com sucesso.', 'Sucesso');
        },
        error: (error: HttpErrorResponse) => {
          this.saving = false;
          this.errorMessage = this.buildErrorMessage('Falha ao atualizar assinaturas.', error);
        }
      });
  }

  retry(): void {
    this.loadData();
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

  validUntil(planId: string): string {
    const subscription = this.subscriptionsByPlanId.get(planId);
    if (!subscription) {
      return '-';
    }

    return new Date(subscription.endsAt).toLocaleString('pt-BR');
  }

  private loadData(): void {
    if (!this.tenantId || !this.clientId) {
      return;
    }

    this.loading = true;
    this.errorMessage = null;

    forkJoin({
      plans: this.plansService.list(this.tenantId, 0, 200, undefined, true),
      subscriptions: this.subscriptionsService.getCurrent(this.tenantId, this.clientId)
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ plans, subscriptions }) => {
          this.loading = false;
          this.plans = plans.items ?? [];
          this.selectedPlanIds = subscriptions.items.map((item) => item.planId);
          this.syncSubscriptionMap(subscriptions.items);
        },
        error: (error: HttpErrorResponse) => {
          this.loading = false;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar assinaturas de planos.', error);
        }
      });
  }

  private syncSubscriptionMap(items: ClientPlanSubscriptionItem[]): void {
    this.subscriptionsByPlanId.clear();
    for (const item of items) {
      this.subscriptionsByPlanId.set(item.planId, item);
    }
  }

  private buildErrorMessage(baseMessage: string, error: HttpErrorResponse): string {
    const apiMessage = typeof error.error?.message === 'string' ? error.error.message : null;
    const traceId =
      (typeof error.error?.traceId === 'string' ? error.error.traceId : null) ||
      error.headers?.get('X-Correlation-Id');

    const invalidPlanIds = this.readInvalidList(error.error?.errors, 'invalidPlanIds');
    const inactivePlanIds = this.readInvalidList(error.error?.errors, 'inactivePlanIds');

    const message = apiMessage && apiMessage.trim() ? apiMessage.trim() : baseMessage;
    const parts: string[] = [];
    if (invalidPlanIds.length > 0) {
      parts.push(`Planos invalidos: ${invalidPlanIds.join(', ')}`);
    }
    if (inactivePlanIds.length > 0) {
      parts.push(`Planos inativos: ${inactivePlanIds.join(', ')}`);
    }

    const composed = parts.length > 0 ? `${message}. ${parts.join(' | ')}` : message;
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
}
