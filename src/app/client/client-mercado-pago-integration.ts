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
  authorizationIssue: string | null = null;
  lastProbeErrorCode: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly service: MercadoLivreIntegrationService,
    private readonly route: ActivatedRoute,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    this.load();
    const signal = this.route.snapshot.queryParamMap.get('mp');
    if (signal === 'connected') this.toastr.success('Mercado Pago conectado. A conferência financeira é uma etapa separada.', 'Autorização concluída');
    if (signal && signal !== 'connected') {
      this.authorizationIssue = this.signalMessage(signal);
      this.toastr.warning(this.authorizationIssue, 'Mercado Pago');
    }
  }

  ngOnDestroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.service.mercadoPagoStatus().pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$)).subscribe({
      next: status => {
        this.status = status;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        const retryAt = status.grants?.[0]?.retryAfter;
        if (retryAt && this.isRateLimited) {
          const delay = new Date(retryAt).getTime() - Date.now();
          if (delay > 0) this.retryTimer = setTimeout(() => this.load(), Math.min(delay + 1000, 2_147_483_647));
        }
      },
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
    if (this.probing || !this.status?.connected || this.isRateLimited) return;
    this.probing = true;
    this.service.mercadoPagoProbeBilling()
      .pipe(finalize(() => (this.probing = false)), takeUntil(this.destroy$))
      .subscribe({
        next: results => {
          this.load();
          const result = results[0];
          this.lastProbeErrorCode = result?.verified ? null : result?.errorCode ?? null;
          if (result?.verified) this.toastr.success('Dados financeiros acessíveis. A conferência poderá confirmar os valores.', 'Acesso confirmado');
          else this.toastr.warning(this.probeMessage(result), 'Conferência pendente');
        },
        error: () => this.toastr.danger('Não foi possível verificar os dados financeiros agora. Aguarde e tente novamente.', 'Falha na verificação')
      });
  }

  get connectedGrant() {
    return this.status?.grants?.[0] ?? null;
  }

  get billingIssue(): string | null {
    const errorCode = this.billingErrorCode;
    return errorCode ? this.probeMessage({ errorCode, sellerId: this.connectedGrant?.sellerId ?? 0, verified: false }) : null;
  }

  get billingErrorCode(): string | null {
    return this.lastProbeErrorCode ?? this.connectedGrant?.capabilityError ?? null;
  }

  get isRateLimited(): boolean {
    const retryAt = this.connectedGrant?.retryAfter;
    return (this.billingErrorCode === 'MP_BILLING_RATE_LIMITED' || !!this.billingErrorCode?.startsWith('MP_BILLING_HTTP_429'))
      && !!retryAt && new Date(retryAt).getTime() > Date.now();
  }

  get requiresReauthorization(): boolean {
    return this.billingErrorCode === 'MP_REAUTHORIZATION_REQUIRED' || !!this.billingErrorCode?.startsWith('MP_BILLING_HTTP_401');
  }

  private probeMessage(result?: MercadoPagoBillingProbeResult): string {
    const code = result?.errorCode ?? '';
    if (code === 'MP_BILLING_RATE_LIMITED' || code.startsWith('MP_BILLING_HTTP_429'))
      return 'O provedor limitou a consulta. Aguarde alguns minutos antes de verificar novamente.';
    if (code === 'MP_REAUTHORIZATION_REQUIRED' || code.startsWith('MP_BILLING_HTTP_401'))
      return 'O acesso foi recusado pelo Billing. Renove a autorização com a conta do seller conectado.';
    if (code.includes('ABUSE_PREVENTION_ERROR'))
      return 'O provedor bloqueou temporariamente a consulta por prevenção de abuso. Aguarde antes de tentar novamente; renovar a autorização não resolve esse bloqueio.';
    if (code.includes('PA_UNAUTHORIZED_RESULT_FROM_POLICIES'))
      return 'O provedor recusou o token atual para consultar o Billing (política de acesso). A autorização financeira existe, mas não podemos confirmar valores até verificar a aplicação e a permissão efetiva deste seller.';
    if (code.startsWith('MP_BILLING_HTTP_403'))
      return 'O Billing recusou a consulta (HTTP 403). Confira a permissão funcional de faturamento da aplicação e da conta; um bloqueio temporário do provedor também é possível.';
    return 'A autorização existe, mas o acesso ao Billing ainda não foi confirmado.';
  }

  private signalMessage(signal: string): string {
    if (signal === 'seller_mismatch') return 'A autorização retornou um ID de conta diferente do seller vinculado abaixo. A sessão usada na tela de consentimento pode ser diferente da conta exibida no painel de desenvolvedores. Confira qual conta Mercado Livre/Mercado Pago está ativa no navegador e tente com o seller correto. O vínculo existente foi preservado.';
    if (signal === 'oauth_error') return 'O Mercado Pago não concluiu a autorização.';
    return 'Não foi possível concluir a autorização financeira.';
  }
}
