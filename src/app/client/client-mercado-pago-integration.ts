import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { NbButtonModule, NbIconModule, NbToastrService } from '@nebular/theme';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  MercadoLivreIntegrationService,
  MercadoPagoBillingProbeResult,
  MercadoPagoFinancialStatusResult
} from '../core/services/mercado-livre-integration.service';

@Component({
  selector: 'app-client-mercado-pago-integration',
  standalone: true,
  imports: [CommonModule, RouterModule, NbButtonModule, NbIconModule],
  templateUrl: './client-mercado-pago-integration.html',
  styleUrls: ['./client-mercado-pago-integration.scss']
})
export class ClientMercadoPagoIntegration implements OnInit, OnDestroy {
  status: MercadoPagoFinancialStatusResult | null = null;
  loading = false;
  connecting = false;
  probing = false;
  error: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: MercadoLivreIntegrationService,
    private readonly route: ActivatedRoute,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
    const signal = this.route.snapshot.queryParamMap.get('mp');
    if (signal === 'connected') this.toastr.success('Mercado Pago autorizado. Agora verifique o Billing.', 'Autorização concluída');
    if (signal && signal !== 'connected') this.toastr.warning(this.signalMessage(signal), 'Mercado Pago');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.service.mercadoPagoStatus().pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$)).subscribe({
      next: status => (this.status = status),
      error: () => (this.error = 'Não foi possível carregar a autorização do Mercado Pago.')
    });
  }

  connect(): void {
    if (this.connecting) return;
    this.connecting = true;
    this.service.mercadoPagoConnectUrl('/client/integrations/mercadopago')
      .pipe(finalize(() => (this.connecting = false)), takeUntil(this.destroy$))
      .subscribe({
        next: result => (window.location.href = result.url),
        error: () => this.toastr.danger('A aplicação Mercado Pago ainda não está configurada ou a URL não pôde ser criada.', 'Não foi possível conectar')
      });
  }

  probe(): void {
    if (this.probing || !this.status?.connected) return;
    this.probing = true;
    this.service.mercadoPagoProbeBilling()
      .pipe(finalize(() => (this.probing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: results => {
          this.load();
          const result = results[0];
          if (result?.verified) this.toastr.success('Billing do Mercado Pago verificado. A conciliação poderá confirmar os valores.', 'Acesso confirmado');
          else this.toastr.warning(this.probeMessage(result), 'Billing pendente');
        },
        error: () => this.toastr.danger('Não foi possível verificar o Billing agora. Aguarde e tente novamente.', 'Falha na verificação')
      });
  }

  get connectedGrant() {
    return this.status?.grants?.[0] ?? null;
  }

  private probeMessage(result?: MercadoPagoBillingProbeResult): string {
    switch (result?.errorCode) {
      case 'MP_BILLING_RATE_LIMITED': return 'O Mercado Pago limitou a consulta. Aguarde alguns minutos antes de tentar novamente.';
      case 'MP_REAUTHORIZATION_REQUIRED': return 'A autorização expirou. Conecte o Mercado Pago novamente.';
      case 'MP_BILLING_HTTP_401': return 'O acesso foi recusado pelo Billing. Renove a autorização.';
      default: return 'A autorização existe, mas o acesso ao Billing ainda não foi confirmado.';
    }
  }

  private signalMessage(signal: string): string {
    if (signal === 'seller_mismatch') return 'A conta autorizada não pertence ao seller Mercado Livre conectado.';
    if (signal === 'oauth_error') return 'O Mercado Pago não concluiu a autorização.';
    return 'Não foi possível concluir a autorização financeira.';
  }
}
