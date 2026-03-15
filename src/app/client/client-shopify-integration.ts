import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NbButtonModule, NbIconModule, NbInputModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  ShopifyIntegrationService,
  ShopifyIntegrationStatus,
  ShopifySyncResult
} from '../core/services/shopify-integration.service';

@Component({
  selector: 'app-client-shopify-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule, NbInputModule],
  templateUrl: './client-shopify-integration.html',
  styleUrls: ['./client-shopify-integration.scss']
})
export class ClientShopifyIntegration implements OnInit, OnDestroy {
  loading = false;
  connecting = false;
  syncing = false;
  disconnecting = false;

  error: string | null = null;
  status: ShopifyIntegrationStatus | null = null;
  lastSync: ShopifySyncResult | null = null;

  shopInput = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: ShopifyIntegrationService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadStatus();

    // Handle OAuth callback query params
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const shopifyParam = params.get('shopify');
      if (shopifyParam === 'connected') {
        this.toastr.success('Loja Shopify conectada com sucesso!', 'Shopify');
        this.loadStatus();
      } else if (shopifyParam === 'oauth_error') {
        this.toastr.danger('Falha na autorização Shopify. Tente novamente.', 'Shopify');
      } else if (shopifyParam === 'missing_code_or_state') {
        this.toastr.danger('Parâmetros OAuth inválidos.', 'Shopify');
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
          this.error = this.buildErrorMessage('Falha ao verificar status da integração Shopify.', err);
        }
      });
  }

  connect(): void {
    const shop = this.shopInput.trim();
    if (!shop) {
      this.toastr.warning('Informe o domínio da loja (ex: minha-loja.myshopify.com)', 'Shopify');
      return;
    }

    this.connecting = true;
    this.service
      .connectUrl(shop)
      .pipe(
        finalize(() => (this.connecting = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (result) => {
          window.location.href = result.url;
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao gerar URL de conexão.', err), 'Shopify');
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
          this.status = this.status ? { ...this.status, lastSyncAt: result.syncedAt } : this.status;
          this.toastr.success(`${result.ordersFetched} pedidos sincronizados.`, 'Shopify');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar pedidos.', err), 'Shopify');
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
          this.status = null;
          this.lastSync = null;
          this.shopInput = '';
          this.toastr.success('Shopify desconectado com sucesso.', 'Shopify');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao desconectar Shopify.', err), 'Shopify');
        }
      });
  }

  private buildErrorMessage(fallback: string, err: HttpErrorResponse): string {
    const message = err?.error?.message;
    return message ? `${fallback} ${message}` : fallback;
  }
}
