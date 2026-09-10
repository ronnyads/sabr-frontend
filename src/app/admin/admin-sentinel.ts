import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SentinelDetail, SentinelPage, SentinelService, SentinelShipment, SentinelSummary } from '../core/services/sentinel.service';

const LABELS: Record<string, string> = {
  NORMAL: 'Normal', MONITOR: 'Acompanhar', ATTENTION: 'Atenção', URGENT: 'Urgente',
  CRITICAL: 'Crítico', OVERDUE: 'Atrasado', STALE: 'Dados desatualizados',
  INTEGRATION_RISK: 'Risco de integração', NO_DEADLINE: 'Sem deadline', RECEIVED: 'Recebido',
  LABEL_PRINTED: 'Etiqueta impressa', PICKING: 'Em separação', SEPARATED: 'Separado', PACKED: 'Embalado',
  SHIPPED: 'Enviado confirmado', PACKED_WITHOUT_CONFIRMATION: 'Embalado sem confirmação',
  INTEGRATION_DIVERGENCE: 'Divergência de integração', INTERNAL_OPERATION: 'Operação interna',
  LABEL_UNAVAILABLE: 'Etiqueta indisponível'
};

@Component({
  selector: 'app-admin-sentinel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-sentinel.html',
  styleUrls: ['./admin-sentinel.scss']
})
export class AdminSentinel implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<SentinelSummary | null>(null);
  readonly page = signal<SentinelPage | null>(null);
  readonly detail = signal<SentinelDetail | null>(null);
  readonly selected = signal<SentinelShipment | null>(null);
  private timer?: number;

  constructor(private readonly api: SentinelService) {}

  ngOnInit(): void {
    this.load();
    if (typeof window !== 'undefined') {
      this.timer = window.setInterval(() => this.load(false), 30_000);
    }
  }

  ngOnDestroy(): void {
    if (this.timer) window.clearInterval(this.timer);
  }

  load(showLoading = true): void {
    if (showLoading) this.loading.set(true);
    this.error.set('');
    forkJoin({ summary: this.api.getSummary(), page: this.api.getShipments() }).subscribe({
      next: result => {
        this.summary.set(result.summary);
        this.page.set(result.page);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Não foi possível atualizar a torre. Confira a integração e tente novamente.');
        this.loading.set(false);
      }
    });
  }

  select(item: SentinelShipment): void {
    this.selected.set(item);
    this.api.getShipment(item.shipmentId).subscribe({ next: detail => this.detail.set(detail) });
  }

  closeDetail(): void {
    this.selected.set(null);
    this.detail.set(null);
  }

  remaining(item: SentinelShipment): string {
    if (!item.dispatchDeadline) return 'Sem deadline oficial';
    const minutes = Math.floor((new Date(item.dispatchDeadline).getTime() - Date.now()) / 60000);
    if (minutes < 0) return `${Math.abs(minutes)} min atrasado`;
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }

  label(value: string): string {
    return LABELS[value] ?? value.replaceAll('_', ' ').toLowerCase();
  }
}
