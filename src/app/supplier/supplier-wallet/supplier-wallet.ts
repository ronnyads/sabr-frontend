import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NbButtonModule, NbSpinnerModule } from '@nebular/theme';
import { SupplierWalletEntry, SupplierWalletService, SupplierWalletSummary } from '../../core/services/supplier-wallet.service';

@Component({
  selector: 'app-supplier-wallet',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbSpinnerModule],
  templateUrl: './supplier-wallet.html'
})
export class SupplierWallet implements OnInit {
  summary: SupplierWalletSummary | null = null;
  entries: SupplierWalletEntry[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  loading = false;
  loadingEntries = false;
  error = '';

  constructor(private svc: SupplierWalletService) {}

  ngOnInit(): void {
    this.loadSummary();
    this.loadEntries();
  }

  loadSummary(): void {
    this.loading = true;
    this.svc.getSummary().subscribe({
      next: (s) => { this.summary = s; this.loading = false; },
      error: () => { this.error = 'Erro ao carregar saldo.'; this.loading = false; }
    });
  }

  loadEntries(): void {
    this.loadingEntries = true;
    this.svc.getEntries(this.page, this.pageSize).subscribe({
      next: (r) => { this.entries = r.items; this.total = r.total; this.loadingEntries = false; },
      error: () => { this.loadingEntries = false; }
    });
  }

  previousPage(): void { if (this.page > 1) { this.page--; this.loadEntries(); } }
  nextPage(): void { if (this.page * this.pageSize < this.total) { this.page++; this.loadEntries(); } }
  get hasPrevious(): boolean { return this.page > 1; }
  get hasNext(): boolean { return this.page * this.pageSize < this.total; }

  entryStatusLabel(s: string): string {
    const map: Record<string, string> = {
      Pending: 'Pendente', Available: 'Disponível', Withdrawing: 'Em Saque',
      Withdrawn: 'Sacado', Reversed: 'Revertido', Blocked: 'Bloqueado', Refunded: 'Reembolsado'
    };
    return map[s] ?? s;
  }

  trackEntry(_: number, e: SupplierWalletEntry): string { return e.id; }
}
