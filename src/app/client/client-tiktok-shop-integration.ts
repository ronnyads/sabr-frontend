import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
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
import { CatalogService, CatalogVariant } from '../core/services/catalog.service';
import {
  MarketplaceMappingResult,
  MarketplaceMappingsService,
  MarketplaceUnmappedItem
} from '../core/services/marketplace-mappings.service';
import {
  TikTokShopCategoryResult,
  TikTokShopIntegrationService,
  TikTokShopIntegrationStatus,
  TikTokShopListingResult,
  TikTokShopOrderListItem,
  TikTokShopPublishResult,
  TikTokShopPublishValidateResult,
} from '../core/services/tiktok-shop-integration.service';

@Component({
  selector: 'app-client-tiktok-shop-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NbButtonModule, NbIconModule, NbTabsetModule, NbFormFieldModule, NbInputModule, NbSelectModule, NbSpinnerModule],
  templateUrl: './client-tiktok-shop-integration.html',
  styleUrls: ['./client-tiktok-shop-integration.scss']
})
export class ClientTikTokShopIntegration implements OnInit, OnDestroy {
  private static readonly provider = 'TikTokShop';

  loading = false;
  connecting = false;
  disconnecting = false;
  resetting = false;
  showResetConfirm = false;
  syncing = false;
  error: string | null = null;
  status: TikTokShopIntegrationStatus | null = null;

  ordersLoading = false;
  ordersError: string | null = null;
  orders: TikTokShopOrderListItem[] = [];
  ordersTotal = 0;
  ordersSkip = 0;
  ordersLimit = 20;
  ordersStatusFilter = '';

  mappingsLoading = false;
  mappingsError: string | null = null;
  mappings: MarketplaceMappingResult[] = [];
  deletingMappingId: string | null = null;
  savingMappingId: string | null = null;
  mappingSelection: Record<string, string> = {};

  unmappedItemsLoading = false;
  unmappedItemsError: string | null = null;
  unmappedItems: MarketplaceUnmappedItem[] = [];
  savingUnmappedKey: string | null = null;
  unmappedSelection: Record<string, string> = {};

  allowedVariantsLoading = false;
  allowedVariantsError: string | null = null;
  allowedVariants: CatalogVariant[] = [];

  categories: { id: string; localName: string }[] = [];
  categoriesLoading = false;
  categoriesError: string | null = null;
  categoriesReconnectRequired = false;
  selectedCategoryId = '';
  publishSkuInput = '';
  publishValidating = false;
  validateResult: TikTokShopPublishValidateResult | null = null;
  publishing = false;
  publishResult: TikTokShopPublishResult | null = null;
  connectionWarning: string | null = null;
  private reconnectWarningToastShown = false;

  listings: TikTokShopListingResult[] = [];
  listingsLoading = false;
  listingsError: string | null = null;
  private pendingConnectToast = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: TikTokShopIntegrationService,
    private readonly marketplaceMappingsService: MarketplaceMappingsService,
    private readonly catalogService: CatalogService,
    private readonly toastr: NbToastrService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadStatus();

    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const tikTokParam = params.get('tiktok');
      if (tikTokParam === 'connected') {
        this.pendingConnectToast = true;
        this.loadStatus();
      } else if (tikTokParam === 'oauth_error') {
        this.pendingConnectToast = false;
        this.toastr.danger('Falha na autorizacao do TikTok Shop. Tente novamente.', 'TikTok Shop');
      } else if (tikTokParam === 'missing_code_or_state' || tikTokParam === 'invalid_state') {
        this.pendingConnectToast = false;
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

  loadStatus(): void {
    this.loading = true;
    this.error = null;
    this.service
      .status()
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.status = result;
          this.applyConnectionWarning(result);
          if (this.pendingConnectToast) {
            if (result.requiresReconnect) {
              this.pendingConnectToast = false;
            } else {
              this.toastr.success('Conta TikTok Shop conectada com sucesso!', 'TikTok Shop');
              this.pendingConnectToast = false;
            }
          }
          if (result.isConnected) {
            this.loadOrders();
            this.loadMappings();
            this.loadUnmappedItems();
            this.loadAllowedVariants();
            this.loadListings();
            if (result.requiresReconnect) {
              this.categories = [];
              this.selectedCategoryId = '';
              this.categoriesReconnectRequired = true;
              this.categoriesError = this.connectionWarning;
            } else {
              this.loadCategories();
            }
          } else {
            this.resetTikTokData();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.status = null;
          this.pendingConnectToast = false;
          this.connectionWarning = null;
          this.reconnectWarningToastShown = false;
          this.resetTikTokData();
          this.error = this.buildErrorMessage('Falha ao verificar status da integracao TikTok Shop.', err);
        }
      });
  }

  connect(): void {
    this.connecting = true;
    const returnUrl = '/client/integrations/tiktokshop';
    this.service
      .connectUrl(returnUrl)
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
          this.connectionWarning = null;
          this.reconnectWarningToastShown = false;
          this.resetTikTokData();
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
          this.connectionWarning = null;
          this.reconnectWarningToastShown = false;
          this.resetTikTokData();
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
          this.loadStatus();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao sincronizar pedidos.', err), 'TikTok Shop');
        }
      });
  }

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

  loadMappings(): void {
    this.mappingsLoading = true;
    this.mappingsError = null;
    this.marketplaceMappingsService
      .listMappings(ClientTikTokShopIntegration.provider)
      .pipe(finalize(() => (this.mappingsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.mappings = result;
          for (const mapping of result) {
            this.mappingSelection[mapping.id] = mapping.sabrVariantSku;
          }
        },
        error: (err: HttpErrorResponse) => {
          this.mappingsError = this.buildErrorMessage('Falha ao carregar mapeamentos.', err);
        }
      });
  }

  loadUnmappedItems(): void {
    this.unmappedItemsLoading = true;
    this.unmappedItemsError = null;
    this.marketplaceMappingsService
      .listUnmappedItems(ClientTikTokShopIntegration.provider)
      .pipe(finalize(() => (this.unmappedItemsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.unmappedItems = result;
          for (const item of result) {
            this.unmappedSelection[item.mappingKey] = this.unmappedSelection[item.mappingKey] ?? '';
          }
        },
        error: (err: HttpErrorResponse) => {
          this.unmappedItemsError = this.buildErrorMessage('Falha ao carregar itens nao mapeados.', err);
        }
      });
  }

  loadAllowedVariants(force = false): void {
    if (this.allowedVariantsLoading || (this.allowedVariants.length > 0 && !force)) {
      return;
    }

    this.allowedVariantsLoading = true;
    this.allowedVariantsError = null;
    this.catalogService
      .listCatalogVariants(0, 200)
      .pipe(finalize(() => (this.allowedVariantsLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.allowedVariants = result.items ?? [];
        },
        error: (err: HttpErrorResponse) => {
          this.allowedVariantsError = this.buildErrorMessage('Falha ao carregar variantes liberadas.', err);
        }
      });
  }

  saveUnmappedItem(item: MarketplaceUnmappedItem): void {
    const selectedVariantSku = (this.unmappedSelection[item.mappingKey] ?? '').trim();
    if (!selectedVariantSku) {
      return;
    }

    this.savingUnmappedKey = item.mappingKey;
    this.marketplaceMappingsService
      .createMapping({
        provider: ClientTikTokShopIntegration.provider,
        sellerId: item.sellerId ?? null,
        integrationId: item.integrationId ?? null,
        externalItemId: item.externalItemId,
        externalVariationId: item.externalVariationId ?? null,
        selectedCatalogSku: selectedVariantSku
      })
      .pipe(finalize(() => (this.savingUnmappedKey = null)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.unmappedSelection[item.mappingKey] = result.sabrVariantSku;
          this.toastr.success(this.mappingSuccessMessage(result.action), 'TikTok Shop');
          this.reloadMappingData();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao mapear item do TikTok Shop.', err), 'TikTok Shop');
        }
      });
  }

  saveExistingMapping(mapping: MarketplaceMappingResult): void {
    const selectedVariantSku = (this.mappingSelection[mapping.id] ?? '').trim();
    if (!selectedVariantSku || selectedVariantSku === mapping.sabrVariantSku) {
      return;
    }

    if (!window.confirm(this.responsibilityWarningMessage())) {
      this.mappingSelection[mapping.id] = mapping.sabrVariantSku;
      return;
    }

    this.savingMappingId = mapping.id;
    this.marketplaceMappingsService
      .createMapping({
        provider: ClientTikTokShopIntegration.provider,
        sellerId: mapping.sellerId ?? null,
        integrationId: mapping.integrationId ?? null,
        externalItemId: mapping.externalItemId,
        externalVariationId: mapping.externalVariationId ?? null,
        selectedCatalogSku: selectedVariantSku
      })
      .pipe(finalize(() => (this.savingMappingId = null)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.mappingSelection[mapping.id] = result.sabrVariantSku;
          this.toastr.success(this.mappingSuccessMessage(result.action), 'TikTok Shop');
          this.reloadMappingData();
        },
        error: (err: HttpErrorResponse) => {
          this.mappingSelection[mapping.id] = mapping.sabrVariantSku;
          this.toastr.danger(this.buildErrorMessage('Falha ao trocar mapeamento.', err), 'TikTok Shop');
        }
      });
  }

  deleteMapping(id: string): void {
    this.deletingMappingId = id;
    this.marketplaceMappingsService
      .deleteMapping(id)
      .pipe(finalize(() => (this.deletingMappingId = null)), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Mapeamento removido.', 'TikTok Shop');
          this.reloadMappingData();
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.danger(this.buildErrorMessage('Falha ao remover mapeamento.', err), 'TikTok Shop');
        }
      });
  }

  loadCategories(): void {
    this.categoriesLoading = true;
    this.categoriesError = null;
    this.categoriesReconnectRequired = false;
    this.service
      .getCategories()
      .pipe(finalize(() => (this.categoriesLoading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.categoriesError = null;
          this.categoriesReconnectRequired = false;
          this.categories = result
            .filter((c: TikTokShopCategoryResult) => c.isLeaf)
            .map((c: TikTokShopCategoryResult) => ({ id: c.id, localName: c.localName }));
        },
        error: (err: HttpErrorResponse) => {
          this.categories = [];
          this.selectedCategoryId = '';

          if (this.readApiCode(err) === 'TIKTOK_SHOP_RECONNECT_REQUIRED') {
            this.categoriesReconnectRequired = true;
            this.categoriesError = this.connectionWarning ?? 'A conexao TikTok Shop ficou inconsistente apos a autorizacao. Reconecte a conta para carregar as categorias.';
            return;
          }

          this.categoriesError = this.buildErrorMessage('Nao foi possivel carregar as categorias TikTok.', err);
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
            `${result.published} publicados, ${result.alreadyMapped} ja mapeados, ${result.failed} falhas.`,
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

  variantOptionLabel(variant: CatalogVariant): string {
    const details = [variant.productName, variant.variantName].filter(Boolean).join(' / ');
    return `${variant.variantSku}${details ? ` - ${details}` : ''}`;
  }

  mappingReasonLabel(reason?: string | null): string {
    switch (reason) {
      case 'unmapped_missing_channel_sku':
        return 'SKU externa ausente no TikTok';
      case 'unmapped_unknown_channel_sku':
        return 'SKU externa desconhecida no catalogo';
      case 'unmapped_sku_not_authorized':
        return 'SKU externa encontrada, mas fora do catalogo autorizado';
      case 'unmapped_mapping_not_authorized':
        return 'Mapeamento atual aponta para SKU nao autorizada';
      case 'mapped_by_exact_sku':
        return 'Auto-mapeado por SKU exata';
      case 'mapped_by_listing_map':
        return 'Mapeado manualmente';
      default:
        return 'Pendente de mapeamento';
    }
  }

  tikTokItemLabel(item: { externalItemId: string; productName?: string | null }): string {
    return item.productName?.trim() || item.externalItemId;
  }

  tikTokSkuLabel(item: { channelSku?: string | null; variantName?: string | null; externalVariationId?: string | null }): string {
    return item.channelSku?.trim() || item.variantName?.trim() || item.externalVariationId?.trim() || '-';
  }

  responsibilityWarningMessage(): string {
    return 'Voce esta trocando o produto/variante mapeado para um item do TikTok Shop. Essa escolha e de responsabilidade do cliente e pode impactar estoque, separacao e expedicao. Deseja continuar?';
  }

  mappingSuccessMessage(action: string): string {
    if (action === 'updated') {
      return 'Mapeamento trocado com sucesso. Os pedidos afetados foram reprocessados.';
    }

    if (action === 'unchanged') {
      return 'Esse item ja estava vinculado a variante selecionada.';
    }

    return 'Mapeamento salvo com sucesso. Os pedidos afetados foram reprocessados.';
  }

  private reloadMappingData(): void {
    this.loadMappings();
    this.loadUnmappedItems();
    this.loadOrders();
    this.loadStatus();
  }

  private buildErrorMessage(fallback: string, err: HttpErrorResponse): string {
    const message = err?.error?.message;
    return message ? `${fallback} ${message}` : fallback;
  }

  private readApiCode(err: HttpErrorResponse): string {
    const code = err?.error?.code ?? err?.error?.Code;
    return typeof code === 'string' ? code : '';
  }

  private resetTikTokData(): void {
    this.orders = [];
    this.ordersTotal = 0;
    this.ordersSkip = 0;
    this.mappings = [];
    this.mappingSelection = {};
    this.unmappedItems = [];
    this.unmappedSelection = {};
    this.allowedVariants = [];
    this.allowedVariantsError = null;
    this.categories = [];
    this.categoriesError = null;
    this.categoriesReconnectRequired = false;
    this.selectedCategoryId = '';
    this.validateResult = null;
    this.publishResult = null;
    this.listings = [];
  }

  private applyConnectionWarning(status: TikTokShopIntegrationStatus): void {
    this.connectionWarning = status.requiresReconnect
      ? status.connectionWarning?.trim() || 'A conexao TikTok Shop ficou inconsistente apos a autorizacao. Reconecte a conta para continuar.'
      : null;

    if (!status.requiresReconnect) {
      this.reconnectWarningToastShown = false;
      return;
    }

    if (!this.reconnectWarningToastShown && this.connectionWarning) {
      this.toastr.warning(this.connectionWarning, 'TikTok Shop');
      this.reconnectWarningToastShown = true;
    }
  }
}
