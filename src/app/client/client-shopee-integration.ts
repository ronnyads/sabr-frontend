import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  ShopeeIntegrationService,
  ShopeeIntegrationStatus,
  ShopeeSyncResult
} from '../core/services/shopee-integration.service';

@Component({
  selector: 'app-client-shopee-integration',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './client-shopee-integration.html',
  styleUrls: ['./client-shopee-integration.scss']
})
export class ClientShopeeIntegration implements OnInit, OnDestroy {
  loading = false;
  connecting = false;
  syncing = false;
  disconnecting = false;

  error: string | null = null;
  status: ShopeeIntegrationStatus | null = null;
  lastSync: ShopeeSyncResult | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: ShopeeIntegrationService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadStatus();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const shopeeParam = params.get('shopee');
      if (shopeeParam === 'connected') {
        this.toastr.success('Conta Shopee conectada com sucesso!', 'Shopee');
        this.loadStatus();
      } else if (shopeeParam === 'oauth_error') {
        this.toastr.danger('Falha na autorizacao Shopee. Tente novamente.', 'Shopee');
      } else if (shopeeParam === 'missing_code_or_state') {
        this.toastr.danger('Parametros OAuth invalidos.', 'Shopee');
      } else if (shopeeParam === 'invalid_state') {
        this.toastr.danger('Estado OAuth invalido ou expirado.', 'Shopee');
      }
    });
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
          this.error = this.buildErrorMessage('Falha ao verificar status da integracao Shopee.', err);
        }
      });
  }

  connect(): void {
    this.connecting = true;
    this.service
      .connectUrl('/client/integrations/shopee')
      .pipe(
        finalize(() => (this.connecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          window.location.href = result.url;
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao gerar URL de conexao.', err), 'Shopee');
        }
      });
  }

  syncNow(): void {
    this.syncing = true;
    this.service
      .syncNow()
      .pipe(
        finalize(() => (this.syncing = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          this.lastSync = result;
          this.loadStatus();
          this.toastr.success(`${result.ordersFetched} pedidos sincronizados.`, 'Shopee');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar pedidos.', err), 'Shopee');
        }
      });
  }

  disconnect(): void {
    this.disconnecting = true;
    this.service
      .disconnect()
      .pipe(
        finalize(() => (this.disconnecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.status = { isConnected: false, ordersCount: 0 };
          this.lastSync = null;
          this.toastr.success('Shopee desconectado com sucesso.', 'Shopee');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao desconectar Shopee.', err), 'Shopee');
        }
      });
  }

  private buildErrorMessage(fallback: string, err: HttpErrorResponse): string {
    const message = err?.error?.message;
    return message ? `${fallback} ${message}` : fallback;
  }
}
