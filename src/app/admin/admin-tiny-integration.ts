import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { AdminTinyIntegrationService } from '../core/services/admin-tiny-integration.service';
import { TinyIntegrationStatus } from '../core/services/tiny-integration.service';

@Component({
  selector: 'app-admin-tiny-integration',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-tiny-integration.html',
  styleUrls: ['./admin-tiny-integration.scss']
})
export class AdminTinyIntegration implements OnInit, OnDestroy {
  clientId = '';
  loading = false;
  syncingOrders = false;
  syncingCatalog = false;
  error: string | null = null;
  status: TinyIntegrationStatus | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: AdminTinyIntegrationService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.clientId = (this.route.snapshot.paramMap.get('clientId') ?? '').trim();
    if (!this.clientId) {
      this.error = 'clientId ausente na rota.';
      return;
    }
    this.loadStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get connected(): boolean {
    return !!this.status?.isConnected;
  }

  loadStatus(): void {
    this.loading = true;
    this.error = null;
    this.service
      .getStatus(this.clientId)
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.status = result;
        },
        error: (err: HttpErrorResponse) => {
          this.status = null;
          this.error = this.buildErrorMessage('Falha ao carregar status da integracao Tiny ERP.', err);
        }
      });
  }

  syncOrders(): void {
    if (this.syncingOrders) {
      return;
    }

    this.syncingOrders = true;
    this.service
      .syncOrders(this.clientId)
      .pipe(
        finalize(() => (this.syncingOrders = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.toastr.success(
            `Sync de pedidos concluido. Importados: ${result.imported}, Atualizados: ${result.updated}, Ignorados: ${result.skipped}.`,
            'Tiny ERP'
          );
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar pedidos.', err), 'Erro');
        }
      });
  }

  syncCatalog(): void {
    if (this.syncingCatalog) {
      return;
    }

    this.syncingCatalog = true;
    this.service
      .syncCatalog(this.clientId)
      .pipe(
        finalize(() => (this.syncingCatalog = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.toastr.success(
            `Sync de catalogo concluido. Vinculados: ${result.linked}, Desvinculados: ${result.unlinked}, Ignorados: ${result.skipped}.`,
            'Tiny ERP'
          );
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar catalogo.', err), 'Erro');
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
