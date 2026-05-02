import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import { TinyIntegrationService, TinyIntegrationStatus } from '../core/services/tiny-integration.service';

@Component({
  selector: 'app-client-tiny-integration',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './client-tiny-integration.html',
  styleUrls: ['./client-tiny-integration.scss']
})
export class ClientTinyIntegration implements OnInit, OnDestroy {
  loading = false;
  connecting = false;
  syncing = false;
  disconnecting = false;
  resetting = false;
  showResetConfirm = false;
  error: string | null = null;
  status: TinyIntegrationStatus | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: TinyIntegrationService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
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
      .status()
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
          this.error = this.buildErrorMessage('Falha ao verificar status da integracao Tiny ERP.', err);
        }
      });
  }

  connect(): void {
    if (this.connecting) {
      return;
    }

    this.connecting = true;
    this.service
      .connectUrl()
      .pipe(
        finalize(() => (this.connecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          if (!result?.url) {
            this.toastr.warning('URL de conexao nao retornada pela API.', 'Tiny ERP');
            return;
          }
          window.location.href = result.url;
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao iniciar conexao com o Tiny ERP.', err), 'Erro');
        }
      });
  }

  disconnect(): void {
    if (this.disconnecting) {
      return;
    }

    this.disconnecting = true;
    this.service
      .disconnect()
      .pipe(
        finalize(() => (this.disconnecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.toastr.success('Integracao Tiny ERP desconectada com sucesso.', 'Tiny ERP');
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao desconectar o Tiny ERP.', err), 'Erro');
        }
      });
  }

  openResetConfirm(): void {
    this.showResetConfirm = true;
  }

  cancelReset(): void {
    this.showResetConfirm = false;
  }

  confirmReset(): void {
    if (this.resetting) {
      return;
    }

    this.showResetConfirm = false;
    this.resetting = true;
    this.service
      .reset()
      .pipe(
        finalize(() => (this.resetting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.toastr.success('Integracao Tiny ERP limpa com sucesso.', 'Tiny ERP');
          this.status = null;
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao limpar integracao Tiny ERP.', err), 'Erro');
        }
      });
  }

  syncNow(): void {
    if (this.syncing) {
      return;
    }

    this.syncing = true;
    this.service
      .syncNow()
      .pipe(
        finalize(() => (this.syncing = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.toastr.success(
            `Sync concluido. Importados: ${result.imported}, Atualizados: ${result.updated}, Ignorados: ${result.skipped}.`,
            'Tiny ERP'
          );
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar com o Tiny ERP.', err), 'Erro');
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
