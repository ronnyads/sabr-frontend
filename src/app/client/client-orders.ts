import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbButtonModule, NbIconModule, NbSelectModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import { CatalogService, CatalogVariant } from '../core/services/catalog.service';
import {
  MarketplaceInternalFulfillmentSummaryResult,
  MarketplaceOrderDetail,
  MarketplaceOrderItemDetail,
  MarketplaceOrderListItem,
  MarketplaceOrdersService,
  MarketplaceShipmentMilestonesResult,
  MarketplaceShipmentResult
} from '../core/services/marketplace-orders.service';
import { TikTokShopIntegrationService } from '../core/services/tiktok-shop-integration.service';

const CHANNEL_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando canal',
  awaiting_shipment: 'Aguardando envio',
  channel_dispatched: 'Despachado no canal',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refund_requested: 'Estorno solicitado',
  refunded: 'Estornado',
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  payment_confirmed: 'Confirmado'
};

@Component({
  selector: 'app-client-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, NbButtonModule, NbIconModule, NbSelectModule],
  templateUrl: './client-orders.html',
  styleUrls: ['./client-orders.scss']
})
export class ClientOrders implements OnInit, OnDestroy {
  orders: MarketplaceOrderListItem[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;

  selectedInternalStatus = '';
  selectedChannelStatus = '';
  filterProvider = '';
  expandedOrderId: string | null = null;
  orderDetails: Record<string, MarketplaceOrderDetail> = {};
  detailLoading: Record<string, boolean> = {};
  actionLoading: Record<string, boolean> = {};
  cancelReason: Record<string, string> = {};
  refundReason: Record<string, string> = {};
  showCancelForm: Record<string, boolean> = {};
  showRefundForm: Record<string, boolean> = {};

  allowedVariants: CatalogVariant[] = [];
  variantsLoading = false;
  variantsLoaded = false;
  variantsError: string | null = null;
  itemMappingEditorOpen: Record<string, boolean> = {};
  itemMappingSelection: Record<string, string> = {};
  itemMappingSaving: Record<string, boolean> = {};

  private destroy$ = new Subject<void>();

  readonly providerOptions = [
    { value: '', label: 'Todos os canais' },
    { value: '1', label: 'Mercado Livre' },
    { value: '2', label: 'Tiny ERP' },
    { value: '4', label: 'TikTok Shop' }
  ];

  readonly internalStatusOptions = [
    { value: '', label: 'Status interno' },
    { value: 'received', label: 'Pedido recebido' },
    { value: 'paid', label: 'Pedido pago' },
    { value: 'processing_started', label: 'Em processamento' },
    { value: 'label_printed', label: 'Etiqueta impressa' },
    { value: 'separated', label: 'Pedido separado' },
    { value: 'dispatched', label: 'Pedido enviado' }
  ];

  readonly channelStatusOptions = [
    { value: '', label: 'Status do canal' },
    { value: 'awaiting_shipment', label: 'Aguardando envio' },
    { value: 'channel_dispatched', label: 'Despachado no canal' },
    { value: 'delivered', label: 'Entregue' },
    { value: 'cancelled', label: 'Cancelado' },
    { value: 'refund_requested', label: 'Estorno solicitado' },
    { value: 'refunded', label: 'Estornado' }
  ];

  constructor(
    private readonly ordersService: MarketplaceOrdersService,
    private readonly catalogService: CatalogService,
    private readonly tikTokShopIntegrationService: TikTokShopIntegrationService,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadAllowedVariants();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(preserveExpandedOrderId?: string | null): void {
    this.loading = true;
    this.error = null;
    this.ordersService.listOrders({
      internalStatus: this.selectedInternalStatus || null,
      channelStatus: this.selectedChannelStatus || null,
      provider: this.filterProvider || null,
      skip: this.skip,
      limit: this.limit
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items ?? [];
          this.total = result.total ?? 0;

          const nextExpandedOrderId = preserveExpandedOrderId && this.orders.some(order => order.id === preserveExpandedOrderId)
            ? preserveExpandedOrderId
            : null;

          if (!nextExpandedOrderId) {
            this.orderDetails = {};
            this.detailLoading = {};
          }

          this.expandedOrderId = nextExpandedOrderId;
          if (nextExpandedOrderId) {
            this.loadOrderDetail(nextExpandedOrderId);
          }

          this.loading = false;
        },
        error: () => {
          this.error = 'Erro ao carregar pedidos.';
          this.loading = false;
        }
      });
  }

  loadAllowedVariants(force = false): void {
    if (this.variantsLoading || (this.variantsLoaded && !force)) {
      return;
    }

    this.variantsLoading = true;
    this.variantsError = null;
    this.catalogService.listCatalogVariants(0, 200)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.allowedVariants = result.items ?? [];
          this.variantsLoaded = true;
        },
        error: () => {
          this.variantsError = 'Nao foi possivel carregar as variantes liberadas do catalogo.';
        },
        complete: () => {
          this.variantsLoading = false;
        }
      });
  }

  onFilterChange(): void {
    this.skip = 0;
    this.load();
  }

  prevPage(): void {
    if (this.skip > 0) {
      this.skip = Math.max(0, this.skip - this.limit);
      this.load();
    }
  }

  nextPage(): void {
    if (this.skip + this.limit < this.total) {
      this.skip += this.limit;
      this.load();
    }
  }

  toggleExpand(id: string): void {
    if (this.expandedOrderId === id) {
      this.expandedOrderId = null;
      return;
    }

    this.expandedOrderId = id;
    this.loadAllowedVariants();
    if (!this.orderDetails[id] && !this.detailLoading[id]) {
      this.loadOrderDetail(id);
    }
  }

  providerLabel(provider: number): string {
    if (provider === 1) return 'ML';
    if (provider === 2) return 'Tiny';
    if (provider === 4) return 'TikTok';
    return '';
  }

  providerClass(provider: number): string {
    if (provider === 1) return 'badge-info';
    if (provider === 2) return 'badge-purple';
    if (provider === 4) return 'badge-tiktok';
    return 'badge-neutral';
  }

  internalStageLabel(summary?: MarketplaceInternalFulfillmentSummaryResult | null): string {
    return summary?.label || 'Pedido recebido';
  }

  internalStageClass(stage?: string | null): string {
    switch (stage) {
      case 'dispatched':
        return 'badge-info';
      case 'separated':
        return 'badge-success';
      case 'label_printed':
        return 'badge-warning';
      case 'processing_started':
      case 'paid':
        return 'badge-neutral';
      default:
        return 'badge-neutral';
    }
  }

  channelStatusLabel(order: MarketplaceOrderListItem): string {
    return order.channelStatus?.label || CHANNEL_STATUS_LABELS[order.currentChannelStage] || order.currentChannelStage;
  }

  channelStatusClass(stage?: string | null): string {
    switch (stage) {
      case 'channel_dispatched':
        return 'badge-info';
      case 'delivered':
        return 'badge-delivered';
      case 'cancelled':
      case 'refunded':
        return 'badge-danger';
      case 'refund_requested':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  }

  labelAvailabilityLabel(value?: string | null): string {
    switch (value) {
      case 'available_cached':
        return 'Etiqueta cacheada';
      case 'available_remote':
        return 'Etiqueta disponivel';
      default:
        return 'Etiqueta pendente';
    }
  }

  isLabelReady(value?: string | null): boolean {
    return value === 'available_cached' || value === 'available_remote';
  }

  labelAvailabilityClass(value?: string | null): string {
    return this.isLabelReady(value) ? 'enabled' : '';
  }

  markPaid(order: MarketplaceOrderListItem): void {
    const key = `${order.id}_pay`;
    this.actionLoading[key] = true;
    this.ordersService.markPaid(order.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Pagamento confirmado com sucesso.', 'Pedidos');
          this.load(order.id);
        },
        error: (err: any) => {
          const msg = err?.error?.message ?? 'Erro ao confirmar pagamento.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[key] = false;
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  pullLabel(order: MarketplaceOrderListItem, shipment?: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment?.shipmentId ?? 'order'}_pull`;
    this.actionLoading[key] = true;
    this.ordersService.pullLabel(order.id, shipment?.shipmentId ?? null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.succeeded) {
            this.toastr.success(result.message, 'Etiqueta');
          } else {
            this.toastr.warning(result.message, 'Etiqueta');
          }
          this.load(order.id);
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao puxar etiqueta.', 'Etiqueta');
          this.actionLoading[key] = false;
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  pullFilteredLabels(): void {
    if (this.orders.length === 0) {
      return;
    }

    this.actionLoading['bulk_pull'] = true;
    this.ordersService.pullLabelsBulk(this.orders.map(order => order.id))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          const title = result.failed > 0 ? 'Etiquetas' : 'Etiquetas atualizadas';
          const message = `${result.succeeded} pedido(s) atualizado(s)` + (result.failed > 0 ? `, ${result.failed} falharam.` : '.');
          if (result.failed > 0) {
            this.toastr.warning(message, title);
          } else {
            this.toastr.success(message, title);
          }
          this.load(this.expandedOrderId);
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao puxar etiquetas em massa.', 'Etiquetas');
          this.actionLoading['bulk_pull'] = false;
        },
        complete: () => { this.actionLoading['bulk_pull'] = false; }
      });
  }

  downloadLabel(order: MarketplaceOrderListItem, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_label`;
    this.actionLoading[key] = true;
    this.ordersService.downloadLabel(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `etiqueta-${order.mlOrderId}-${shipment.shipmentId}.pdf`;
          anchor.click();
          URL.revokeObjectURL(url);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Etiqueta indisponivel no momento.';
          this.toastr.danger(msg, 'Etiqueta');
        },
        complete: () => { this.actionLoading[key] = false; }
      });
  }

  toggleCancelForm(orderId: string): void {
    this.showCancelForm[orderId] = !this.showCancelForm[orderId];
    this.showRefundForm[orderId] = false;
  }

  submitCancel(orderId: string): void {
    this.actionLoading[orderId] = true;
    this.ordersService.cancelOrder(orderId, this.cancelReason[orderId] || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.toastr.success(result.message || (result.action === 'cancellation_requested'
            ? 'Solicitacao de cancelamento enviada.'
            : 'Pedido cancelado com sucesso.'), 'Cancelamento');
          this.showCancelForm[orderId] = false;
          this.load(orderId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Erro ao cancelar pedido.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[orderId] = false;
        },
        complete: () => { this.actionLoading[orderId] = false; }
      });
  }

  toggleRefundForm(orderId: string): void {
    this.showRefundForm[orderId] = !this.showRefundForm[orderId];
    this.showCancelForm[orderId] = false;
  }

  submitRefund(orderId: string): void {
    this.actionLoading[orderId] = true;
    this.ordersService.requestRefund(orderId, this.refundReason[orderId] || null)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success('Solicitacao de estorno enviada.', 'Estorno');
          this.showRefundForm[orderId] = false;
          this.load(orderId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Erro ao solicitar estorno.';
          this.toastr.danger(msg, 'Erro');
          this.actionLoading[orderId] = false;
        },
        complete: () => { this.actionLoading[orderId] = false; }
      });
  }

  formatProviderName(shipment: MarketplaceShipmentResult): string {
    return shipment.shippingProvider || shipment.trackingMethod || shipment.logisticType || 'Marketplace';
  }

  getExpandedShipments(order: MarketplaceOrderListItem): MarketplaceShipmentResult[] {
    return this.orderDetails[order.id]?.shipments ?? [];
  }

  isPullLabelLoading(order: MarketplaceOrderListItem, shipment?: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment?.shipmentId ?? 'order'}_pull`];
  }

  isLabelLoading(order: MarketplaceOrderListItem, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_label`];
  }

  isTikTokOrder(order: MarketplaceOrderListItem): boolean {
    return order.provider === 4;
  }

  openItemMappingEditor(item: MarketplaceOrderItemDetail): void {
    this.loadAllowedVariants();
    this.itemMappingEditorOpen[item.id] = true;
    this.itemMappingSelection[item.id] = item.sabrVariantSku ?? this.itemMappingSelection[item.id] ?? '';
  }

  closeItemMappingEditor(itemId: string): void {
    this.itemMappingEditorOpen[itemId] = false;
  }

  isItemMappingEditorOpen(itemId: string): boolean {
    return !!this.itemMappingEditorOpen[itemId];
  }

  saveItemMapping(order: MarketplaceOrderListItem, item: MarketplaceOrderItemDetail): void {
    const selectedVariantSku = (this.itemMappingSelection[item.id] ?? '').trim();
    if (!selectedVariantSku) {
      return;
    }

    const isRemap = !!item.sabrVariantSku && item.sabrVariantSku !== selectedVariantSku;
    if (isRemap && !window.confirm(this.remapResponsibilityMessage())) {
      return;
    }

    this.itemMappingSaving[item.id] = true;
    this.tikTokShopIntegrationService.createMapping({
      tikTokItemId: item.mlItemId,
      tikTokSkuId: item.mlVariationId ?? null,
      sabrVariantSku: selectedVariantSku
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.itemMappingEditorOpen[item.id] = false;
          this.itemMappingSelection[item.id] = result.sabrVariantSku;
          this.toastr.success(this.mappingSuccessMessage(result.action), 'Mapeamento TikTok');
          this.load(order.id);
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Falha ao salvar mapeamento do item.', 'Mapeamento TikTok');
        },
        complete: () => {
          this.itemMappingSaving[item.id] = false;
        }
      });
  }

  variantOptionLabel(variant: CatalogVariant): string {
    const details = [variant.productName, variant.variantName].filter(Boolean).join(' / ');
    return `${variant.variantSku}${details ? ` - ${details}` : ''}`;
  }

  remapResponsibilityMessage(): string {
    return 'Voce esta trocando o produto/variante mapeado para este item do TikTok Shop. Essa escolha e de responsabilidade do cliente e pode impactar estoque, separacao e expedicao. Deseja continuar?';
  }

  mappingSuccessMessage(action: string): string {
    if (action === 'updated') {
      return 'Mapeamento trocado com sucesso. Os pedidos afetados foram reprocessados.';
    }

    if (action === 'unchanged') {
      return 'Esse item ja estava mapeado para a variante selecionada.';
    }

    return 'Mapeamento salvo com sucesso. Os pedidos afetados foram reprocessados.';
  }

  isUrgent(order: MarketplaceOrderListItem): boolean {
    if (!order.shipByDeadlineAt) return false;
    const deadline = new Date(order.shipByDeadlineAt);
    const diff = deadline.getTime() - Date.now();
    return diff > 0 && diff < 4 * 60 * 60 * 1000;
  }

  canShowRefund(order: MarketplaceOrderListItem): boolean {
    return ['paid', 'payment_confirmed', 'label_generated', 'dispatched'].includes(order.status);
  }

  private loadOrderDetail(orderId: string): void {
    this.detailLoading[orderId] = true;
    this.ordersService.getOrder(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail) => {
          this.orderDetails[orderId] = detail;
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Nao foi possivel carregar os detalhes do pedido.';
          this.toastr.danger(msg, 'Pedidos');
        },
        complete: () => {
          this.detailLoading[orderId] = false;
        }
      });
  }

  milestoneEntries(milestones: MarketplaceShipmentMilestonesResult): Array<{ label: string; value?: string | null }> {
    return [
      { label: 'Pedido recebido', value: milestones.receivedAt },
      { label: 'Pedido pago', value: milestones.paidAt },
      { label: 'Em processamento', value: milestones.processingStartedAt },
      { label: 'Etiqueta impressa', value: milestones.labelPrintedAt },
      { label: 'Pedido separado', value: milestones.separatedAt },
      { label: 'Pedido enviado', value: milestones.dispatchedAt }
    ];
  }

  inventoryStatusLabel(value?: string | null): string {
    switch (value) {
      case 'mapped_in_stock':
        return 'Mapeado com estoque';
      case 'mapped_partial_stock':
        return 'Estoque parcial';
      case 'out_of_stock':
        return 'Sem estoque';
      default:
        return 'Sem mapeamento';
    }
  }

  itemStockLabel(value?: string | null): string {
    switch (value) {
      case 'in_stock':
        return 'Estoque ok';
      case 'partial':
        return 'Estoque parcial';
      case 'out_of_stock':
        return 'Sem estoque';
      default:
        return 'Sem mapeamento';
    }
  }

  paymentBlockerLabel(value: string): string {
    switch (value) {
      case 'unmapped_item':
        return 'Item sem mapeamento';
      case 'out_of_stock':
        return 'Sem estoque';
      case 'label_missing':
        return 'Etiqueta pendente';
      case 'cancellation_pending':
        return 'Cancelamento solicitado';
      default:
        return value;
    }
  }

  paymentBlockerSummary(values: string[]): string {
    return values.map((value) => this.paymentBlockerLabel(value)).join(' • ');
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
