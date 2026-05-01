import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NbButtonModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AdminMercadoLivreIntegrationService } from '../core/services/admin-mercado-livre-integration.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { MercadoLivreIntegrationStatusResult } from '../core/services/mercado-livre-integration.service';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { UiStateComponent } from '../shared/ui-state/ui-state.component';

@Component({
  selector: 'app-admin-ml-integrations',
  standalone: true,
  imports: [CommonModule, NbButtonModule, PageHeaderComponent, UiStateComponent],
  templateUrl: './admin-ml-integrations.html',
  styleUrls: ['./admin-ml-integrations.scss']
})
export class AdminMlIntegrations implements OnInit, OnDestroy {
  tenantId = '';
  clientId = '';
  loading = false;
  errorMessage: string | null = null;
  status: MercadoLivreIntegrationStatusResult | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toastr: NbToastrService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly integrationService: AdminMercadoLivreIntegrationService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const routeTenant = (params.get('tenantId') ?? '').trim().toLowerCase();
      const contextTenant = (this.tenantContext.get()?.tenantId ?? '').trim().toLowerCase();
      const tenantId = routeTenant || contextTenant;
      const clientId = (params.get('clientId') ?? '').trim();

      if (!tenantId || !clientId) {
        this.toastr.warning('Cliente obrigatório para acessar integrações.', 'Contexto ausente');
        void this.router.navigate(['/clients']);
        return;
      }

      this.tenantId = tenantId;
      this.clientId = clientId;
      this.tenantContext.set(tenantId, undefined, clientId);
      this.loadStatus();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get empty(): boolean {
    return !this.loading && !this.errorMessage && !this.status;
  }

  loadStatus(): void {
    this.loading = true;
    this.errorMessage = null;
    this.integrationService
      .getStatus(this.tenantId, this.clientId)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.status = result;
        },
        error: (error: HttpErrorResponse) => {
          this.status = null;
          this.errorMessage = this.buildErrorMessage('Falha ao carregar status da integracao.', error);
        }
      });
  }

  forceDisconnect(sellerId?: string): void {
    const message = sellerId
      ? `Desconectar seller ${sellerId} permanentemente?`
      : 'Desconectar TODOS os sellers permanentemente?';
    if (!confirm(message)) return;

    this.integrationService
      .forceDisconnect(this.tenantId, this.clientId, sellerId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success(
            'Integracao desconectada com sucesso.',
            'Force Disconnect'
          );
          this.loadStatus();
        },
        error: (error: HttpErrorResponse) => {
          const message = this.buildErrorMessage(
            'Falha ao desconectar integracao.',
            error
          );
          this.toastr.danger(message, 'Force Disconnect');
        }
      });
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
