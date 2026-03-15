import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, takeUntil } from 'rxjs';
import { AdminFulfillmentOrderResult, AdminOrdersService } from '../core/services/admin-orders.service';

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
    if (this.skip > 0) { this.skip = Math.max(0, this.skip - this.limit); this.load(); }
  }

  nextPage(): void {
    if (this.skip + this.limit < this.total) { this.skip += this.limit; this.load(); }
  }

  deadlineClass(order: AdminFulfillmentOrderResult): string {
    if (!order.shipByDeadlineAt) return '';
    const diff = new Date(order.shipByDeadlineAt).getTime() - Date.now();
    if (diff < 0) return 'deadline-overdue';
    if (diff < 4 * 60 * 60 * 1000) return 'deadline-urgent';
    if (diff < 24 * 60 * 60 * 1000) return 'deadline-warning';
    return 'deadline-ok';
  }

  downloadLabel(order: AdminFulfillmentOrderResult): void {
    const key = order.id + '_label';
    this.actionLoading[key] = true;
    this.ordersService.getLabel(order.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiqueta-${order.mlOrderId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.actionLoading[key] = false;
      },
      error: () => {
        this.toastr.danger('Etiqueta não disponível.', 'Erro');
        this.actionLoading[key] = false;
      }
    });
  }

  dispatch(order: AdminFulfillmentOrderResult): void {
    this.actionLoading[order.id] = true;
    this.ordersService.dispatch(order.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success(`Pedido #${order.mlOrderId} marcado como despachado.`, 'Expedição');
        this.load();
      },
      error: (err) => {
        this.toastr.danger(err?.error?.message ?? 'Erro ao despachar pedido.', 'Erro');
        this.actionLoading[order.id] = false;
      },
      complete: () => { this.actionLoading[order.id] = false; }
    });
  }

  get urgentCount(): number {
    return this.orders.filter(o => o.isUrgent).length;
  }

  get currentPage(): number { return Math.floor(this.skip / this.limit) + 1; }
  get totalPages(): number { return Math.ceil(this.total / this.limit); }
}
