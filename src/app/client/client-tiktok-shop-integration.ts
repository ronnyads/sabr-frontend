import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  NbButtonModule,
  NbFormFieldModule,
  NbIconModule,
  NbInputModule,
  NbSelectModule,
  NbSpinnerModule,
  NbTabsetModule,
  NbToastrService
} from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  TikTokShopCategoryResult,
  TikTokShopCreateMappingRequest,
  TikTokShopIntegrationService,
  TikTokShopIntegrationStatus,
  TikTokShopListingResult,
  TikTokShopMappingResult,
  TikTokShopOrderListItem,
  TikTokShopPublishResult,
  TikTokShopPublishValidateResult
} from '../core/services/tiktok-shop-integration.service';

@Component({
  selector: 'app-client-tiktok-shop-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule, NbTabsetModule, NbFormFieldModule, NbInputModule, NbSelectModule, NbSpinnerModule],
  templateUrl: './client-tiktok-shop-integration.html',
  styleUrls: ['./client-tiktok-shop-integration.scss']
})
export class ClientTikTokShopIntegration implements OnInit, OnDestroy {
  // Connection state
  loading = false;
  connecting = false;
  disconnecting = false;
  resetting = false;
  showResetConfirm = false;
  syncing = false;
  error: string | null = null;
  status: TikTokShopIntegrationStatus | null = null;

  // Orders state
  ordersLoading = false;
  ordersError: string | null = null;
  orders: TikTokShopOrderListItem[] = [];
  ordersTotal = 0;
  ordersSkip = 0;
  ordersLimit = 20;
  ordersStatusFilter = '';

  // Mappings state
  mappingsLoading = false;
  mappingsError: string | null = null;
  mappings: TikTokShopMappingResult[] = [];
  deletingMappingId: string | null = null;

  newMapping: TikTokShopCreateMappingRequest = { tikTokItemId: '', tikTokSkuId: '', sabrVariantSku: '' };
  savingMapping = false;

  // Publish state
  categories: { id: string; localName: string }[] = [];
  categoriesLoading = false;
  selectedCategoryId = '';
  publishSkuInput = '';
  publishValidating = false;
  validateResult: TikTokShopPublishValidateResult | null = null;
  publishing = false;
  publishResult: TikTokShopPublishResult | null = null;

  // Listings state
  listings: TikTokShopListingResult[] = [];
  listingsLoading = false;
  listingsError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: TikTokShopIntegrationService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadStatus();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const tikTokParam = params.get('tiktok');
      if (tikTokParam === 'connected') {
        this.toastr.success('Conta TikTok Shop conectada com sucesso!', 'TikTok Shop');
        this.loadStatus();
      } else if (tikTokParam === 'oauth_error') {
        this.toastr.danger('Falha na autorizacao do TikTok Shop. Tente novamente.', 'TikTok Shop');
      } else if (tikTokParam === 'missing_code_or_state' || tikTokParam === 'invalid_state') {
        this.toastr.danger('Parametros OAuth invalidos.', 'TikTok Shop');
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

  get ordersTotalPages(): number {
    return Math.ceil(this.ordersTotal / this.ordersLimit);
  }

  get ordersCurrentPage(): number {
    return Math.floor(this.ordersSkip / this.ordersLimit) + 1;
  }

  // --- Connection ---

  loadStatus(): void {
    this.loading = true;
    this.error = null;
    this.service
      .status()
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.status = result;
          if (result.isConnected) {
            this.loadOrders();
            this.loadMappings();
            this.loadListings();
            this.loadCategories();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.status = null;
          this.error = this.buildErrorMessage('Falha ao verificar status da integracao TikTok Shop.', err);
        }
      });
  }

  connect(): void {
    this.connecting = true;
    this.service
      .connectUrl('/client/integrations/tiktokshop')
      .pipe(finalize(() => (this.connecting = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => { window.location.href = result.url; },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao gerar URL de conexao.', err), 'TikTok Shop');
        }
      });
  }

  disconnect(): void {
    this.disconnecting = true;
    this.service
      .disconnect()
      .pipe(finalize(() => (this.disconnecting = false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.status = null;
          this.orders = [];
          this.mappings = [];
          this.toastr.success('TikTok Shop desconectado com sucesso.', 'TikTok Shop');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao desconectar TikTok Shop.', err), 'TikTok Shop');
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
      .pipe(finalize(() => (this.resetting = false)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.status = null;
          this.orders = [];
          this.mappings = [];
          this.toastr.success('Integracao TikTok Shop limpa com sucesso.', 'TikTok Shop');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao limpar integracao TikTok Shop.', err), 'Erro');
        }
      });
  }

  syncNow(): void {
    this.syncing = true;
    this.service
      .syncNow()
      .pipe(finalize(() => (this.syncing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(
            `Sync concluido: ${result.ordersUpserted} pedidos, ${result.itemsUpserted} itens.`,
            'TikTok Shop'
          );
          this.loadOrders();
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar pedidos.', err), 'TikTok Shop');
        }
      });
  }

  // --- Orders ---

  loadOrders(): void {
    this.ordersLoading = true;
    this.ordersError = null;
    this.service
      .listOrders({ status: this.ordersStatusFilter || null, skip: this.ordersSkip, limit: this.ordersLimit })
      .pipe(finalize(() => (this.ordersLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items;
          this.ordersTotal = result.total;
        },
        error: (err: HttpErrorResponse) => {
          this.ordersError = this.buildErrorMessage('Falha ao carregar pedidos.', err);
        }
      });
  }

  onOrdersFilterChange(): void {
    this.ordersSkip = 0;
    this.loadOrders();
  }

  ordersNextPage(): void {
    if (this.ordersSkip + this.ordersLimit < this.ordersTotal) {
      this.ordersSkip += this.ordersLimit;
      this.loadOrders();
    }
  }

  ordersPrevPage(): void {
    if (this.ordersSkip > 0) {
      this.ordersSkip = Math.max(0, this.ordersSkip - this.ordersLimit);
      this.loadOrders();
    }
  }

  // --- Mappings ---

  loadMappings(): void {
    this.mappingsLoading = true;
    this.mappingsError = null;
    this.service
      .listMappings()
      .pipe(finalize(() => (this.mappingsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => { this.mappings = result; },
        error: (err: HttpErrorResponse) => {
          this.mappingsError = this.buildErrorMessage('Falha ao carregar mapeamentos.', err);
        }
      });
  }

  saveMapping(): void {
    if (!this.newMapping.tikTokItemId.trim() || !this.newMapping.sabrVariantSku.trim()) return;

    this.savingMapping = true;
    this.service
      .createMapping(this.newMapping)
      .pipe(finalize(() => (this.savingMapping = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.mappings = [result, ...this.mappings];
          this.newMapping = { tikTokItemId: '', tikTokSkuId: '', sabrVariantSku: '' };
          this.toastr.success('Mapeamento criado com sucesso.', 'TikTok Shop');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao criar mapeamento.', err), 'TikTok Shop');
        }
      });
  }

  deleteMapping(id: string): void {
    this.deletingMappingId = id;
    this.service
      .deleteMapping(id)
      .pipe(finalize(() => (this.deletingMappingId = null)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.mappings = this.mappings.filter(m => m.id !== id);
          this.toastr.success('Mapeamento removido.', 'TikTok Shop');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao remover mapeamento.', err), 'TikTok Shop');
        }
      });
  }

  // --- Publish ---

  loadCategories(): void {
    this.categoriesLoading = true;
    this.service
      .getCategories()
      .pipe(finalize(() => (this.categoriesLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.categories = result
            .filter(c => c.isLeaf)
            .map(c => ({ id: c.id, localName: c.localName }));
        },
        error: () => {
          this.toastr.warning('Não foi possível carregar as categorias TikTok.', 'TikTok Shop');
        }
      });
  }

  validatePublish(): void {
    const skus = this.publishSkuInput
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (skus.length === 0) return;

    this.publishValidating = true;
    this.validateResult = null;
    this.publishResult = null;

    this.service
      .validatePublish({ sabrVariantSkus: skus, tikTokCategoryId: this.selectedCategoryId })
      .pipe(finalize(() => (this.publishValidating = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => { this.validateResult = result; },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao validar SKUs.', err), 'TikTok Shop');
        }
      });
  }

  publish(): void {
    if (!this.validateResult || this.validateResult.eligible === 0) return;

    const skus = this.validateResult.items
      .filter(i => i.eligible)
      .map(i => i.sabrVariantSku);

    this.publishing = true;
    this.publishResult = null;

    this.service
      .publish({ sabrVariantSkus: skus, tikTokCategoryId: this.selectedCategoryId })
      .pipe(finalize(() => (this.publishing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.publishResult = result;
          this.toastr.success(
            `${result.published} publicados, ${result.alreadyMapped} já mapeados, ${result.failed} falhas.`,
            'TikTok Shop'
          );
          if (result.published > 0) {
            this.loadListings();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao publicar produtos.', err), 'TikTok Shop');
        }
      });
  }

  // --- Listings ---

  loadListings(): void {
    this.listingsLoading = true;
    this.listingsError = null;
    this.service
      .listListings()
      .pipe(finalize(() => (this.listingsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => { this.listings = result; },
        error: (err: HttpErrorResponse) => {
          this.listingsError = this.buildErrorMessage('Falha ao carregar listings.', err);
        }
      });
  }

  private buildErrorMessage(fallback: string, err: HttpErrorResponse): string {
    const message = err?.error?.message;
    return message ? `${fallback} ${message}` : fallback;
  }
}
