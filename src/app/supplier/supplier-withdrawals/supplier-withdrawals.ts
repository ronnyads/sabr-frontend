import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbButtonModule, NbInputModule, NbSpinnerModule, NbToastrService } from '@nebular/theme';
import { SupplierWalletService, SupplierWalletSummary } from '../../core/services/supplier-wallet.service';
import { SupplierWithdrawalResult, SupplierWithdrawalsService } from '../../core/services/supplier-withdrawals.service';

const STATUS_LABELS: Record<string, string> = {
  Pending: 'Pendente', Approved: 'Aprovado', Rejected: 'Rejeitado',
  Processing: 'Processando', Completed: 'Concluído', Failed: 'Falhou'
};

@Component({
  selector: 'app-supplier-withdrawals',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NbButtonModule, NbInputModule, NbSpinnerModule],
  templateUrl: './supplier-withdrawals.html'
})
export class SupplierWithdrawals implements OnInit {
  withdrawals: SupplierWithdrawalResult[] = [];
  summary: SupplierWalletSummary | null = null;
  total = 0;
  page = 1;
  pageSize = 20;
  loading = false;
  formOpen = false;
  saving = false;
  form!: FormGroup;

  constructor(
    private svc: SupplierWithdrawalsService,
    private walletSvc: SupplierWalletService,
    private fb: FormBuilder,
    private toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      requestedAmountCents: [null, [Validators.required, Validators.min(100)]]
    });
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;
    this.walletSvc.getSummary().subscribe({ next: (s) => this.summary = s });
    this.svc.list(this.page, this.pageSize).subscribe({
      next: (r) => { this.withdrawals = r.items; this.total = r.total; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  openForm(): void { this.formOpen = true; this.form.reset(); }
  cancelForm(): void { this.formOpen = false; }

  request(): void {
    if (this.form.invalid) return;
    this.saving = true;
    this.svc.request(this.form.value.requestedAmountCents).subscribe({
      next: () => {
        this.saving = false; this.formOpen = false;
        this.toastr.success('Saque solicitado com sucesso.', 'Sucesso');
        this.loadAll();
      },
      error: () => { this.saving = false; this.toastr.danger('Erro ao solicitar saque.', 'Erro'); }
    });
  }

  get availableCents(): number { return this.summary?.availableBalanceCents ?? 0; }
  previousPage(): void { if (this.page > 1) { this.page--; this.loadAll(); } }
  nextPage(): void { if (this.page * this.pageSize < this.total) { this.page++; this.loadAll(); } }
  get hasPrevious(): boolean { return this.page > 1; }
  get hasNext(): boolean { return this.page * this.pageSize < this.total; }
  statusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }
  trackWithdrawal(_: number, w: SupplierWithdrawalResult): string { return w.id; }
}
