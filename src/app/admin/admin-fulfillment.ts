import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import {
  AdminFulfillmentOrderResult,
  AdminOrdersService,
  MarketplaceInternalFulfillmentSummaryResult,
  MarketplaceShipmentMilestonesResult,
  MarketplaceShipmentResult
} from '../core/services/admin-orders.service';

@Component({
  selector: 'app-admin-fulfillment',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './admin-fulfillment.html',
  styleUrls: ['./admin-fulfillment.scss']
})
export class AdminFulfillment implements OnInit, OnDestroy {
  orders: AdminFulfillmentOrderResult[] = [];
  total = 0;
  skip = 0;
  limit = 20;
  loading = false;
  error: string | null = null;

  actionLoading: Record<string, boolean> = {};

  private destroy$ = new Subject<void>();

  constructor(
    private ordersService: AdminOrdersService,
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.ordersService.listFulfillment(this.skip, this.limit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.orders = result.items ?? [];
          this.total = result.total ?? 0;
          this.loading = false;
        },
        error: () => {
          this.error = 'Erro ao carregar pedidos para expedição.';
          this.loading = false;
        }
      });
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

  deadlineClass(order: AdminFulfillmentOrderResult): string {
    if (!order.shipByDeadlineAt) return '';
    const diff = new Date(order.shipByDeadlineAt).getTime() - Date.now();
    if (diff < 0) return 'deadline-overdue';
    if (diff < 4 * 60 * 60 * 1000) return 'deadline-urgent';
    if (diff < 24 * 60 * 60 * 1000) return 'deadline-warning';
    return 'deadline-ok';
  }

  fulfillmentStageClass(summary?: MarketplaceInternalFulfillmentSummaryResult | null): string {
    switch (summary?.stage) {
      case 'dispatched':
        return 'label-ready';
      case 'separated':
        return 'label-ready';
      case 'label_printed':
        return 'label-warning';
      default:
        return 'label-neutral';
    }
  }

  downloadLabel(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): void {
    const key = `${order.id}_${shipment.shipmentId}_label`;
    this.actionLoading[key] = true;
    this.ordersService.getLabelByShipment(order.id, shipment.shipmentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `etiqueta-${order.mlOrderId}-${shipment.shipmentId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.toastr.danger('Etiqueta não disponível.', 'Erro');
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  advanceMilestone(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult, milestone: string): void {
    const key = `${order.id}_${shipment.shipmentId}_${milestone}`;
    this.actionLoading[key] = true;
    this.ordersService.advanceShipmentMilestone(order.id, shipment.shipmentId, milestone)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success(`Pacote ${shipment.shipmentId} atualizado.`, 'Expedição');
          this.load();
        },
        error: (err) => {
          this.toastr.danger(err?.error?.message ?? 'Erro ao atualizar expedição.', 'Erro');
        },
        complete: () => {
          this.actionLoading[key] = false;
        }
      });
  }

  isActionLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult, action: string): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_${action}`];
  }

  isLabelLoading(order: AdminFulfillmentOrderResult, shipment: MarketplaceShipmentResult): boolean {
    return !!this.actionLoading[`${order.id}_${shipment.shipmentId}_label`];
  }

  milestoneEntries(milestones: MarketplaceShipmentMilestonesResult): Array<{ label: string; value?: string | null }> {
    return [
      { label: 'Processamento', value: milestones.processingStartedAt },
      { label: 'Etiqueta impressa', value: milestones.labelPrintedAt },
      { label: 'Separado', value: milestones.separatedAt },
      { label: 'Enviado', value: milestones.dispatchedAt }
    ];
  }

  get urgentCount(): number {
    return this.orders.filter(o => o.isUrgent).length;
  }

  get currentPage(): number {
    return Math.floor(this.skip / this.limit) + 1;
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit);
  }
}
