import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ClientWallet, WalletDeposit, WalletService } from '../core/services/wallet.service';

@Component({ selector: 'app-client-wallet', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './client-wallet.html', styleUrls: ['./client-wallet.scss'] })
export class ClientWalletPage implements OnInit {
  wallet?: ClientWallet; loading = true; sending = false; error = ''; success = '';
  amount = ''; note = ''; proof?: File;
  constructor(private readonly service: WalletService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.service.getClientWallet().pipe(finalize(() => this.loading = false)).subscribe({ next: x => this.wallet = x, error: () => this.error = 'Não foi possível carregar sua carteira.' }); }
  chooseFile(event: Event): void { this.proof = (event.target as HTMLInputElement).files?.[0]; }
  submit(): void {
    this.error = ''; this.success = '';
    const rawAmount = this.amount.trim();
    const normalizedAmount = rawAmount.includes(',')
      ? rawAmount.replace(/\./g, '').replace(',', '.')
      : rawAmount;
    const cents = Math.round(Number(normalizedAmount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { this.error = 'Informe um valor válido.'; return; }
    if (!this.proof) { this.error = 'Anexe o comprovante em PDF, JPG ou PNG.'; return; }
    this.sending = true;
    this.service.createDeposit(cents, this.proof, this.note).pipe(finalize(() => this.sending = false)).subscribe({
      next: () => { this.success = 'Depósito enviado para análise.'; this.amount = ''; this.note = ''; this.proof = undefined; this.load(); },
      error: err => this.error = err?.error?.errors?.[0]?.message ?? err?.error?.error ?? 'Não foi possível enviar o depósito.'
    });
  }
  proofDownload(item: WalletDeposit): void { this.service.getClientProof(item.id).subscribe(blob => this.download(blob, item.proofFileName)); }
  format(cents = 0): string { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
  status(status: string): string { return ({ Pending: 'Em análise', Approved: 'Aprovado', Rejected: 'Rejeitado', Cancelled: 'Cancelado' } as Record<string,string>)[status] ?? status; }
  private download(blob: Blob, name: string): void { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
