import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  NbButtonModule,
  NbCardModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbLayoutModule
} from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';
import { AuthDebugLogService } from '../../core/services/auth-debug-log.service';
import { AUTH_REALM, AuthRealm } from '../../core/tokens/auth-realm';
import { BACKEND_OFFLINE_HINT_KEY, BACKEND_OFFLINE_MESSAGE } from '../../core/services/csrf.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbLayoutModule,
    NbCardModule,
    NbInputModule,
    NbButtonModule,
    NbCheckboxModule,
    NbIconModule
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login implements OnDestroy, OnInit {
  form: FormGroup;

  loading = false;
  errorMessage = '';
  showPassword = false;
  retryAfterSeconds = 0;

  private retryTimerId: number | null = null;
  private readonly backendOfflineMessage = BACKEND_OFFLINE_MESSAGE;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private authDebugLog: AuthDebugLogService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(AUTH_REALM) private realm: AuthRealm
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      remember: [true]
    });
  }

  get submitDisabled(): boolean {
    return this.loading || this.retryAfterSeconds > 0;
  }

  ngOnInit(): void {
    this.applyBackendOfflineHintFromBootstrap();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    const currentRoute = this.router.url;
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (this.retryAfterSeconds > 0) {
      this.errorMessage = `Muitas tentativas. Aguarde ${this.retryAfterSeconds}s para tentar novamente.`;
      this.authDebugLog.logLoginError({
        realm: this.resolveDebugRealm(),
        route: currentRoute,
        reason: 'blocked_by_local_cooldown',
        retryAfterSeconds: this.retryAfterSeconds
      });
      return;
    }

    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const email = this.form.value.email ?? '';
    const password = this.form.value.password ?? '';
    this.loading = true;
    this.errorMessage = '';
    this.authDebugLog.logLoginAttempt({
      realm: this.resolveDebugRealm(),
      route: currentRoute,
      returnUrl
    });

    this.auth
      .login(email, password)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.stopRetryCooldown();
          this.clearBackendOfflineHint();
          const accountType = this.resolveAccountType(response);

          if (this.handleCrossRealmLogin(accountType, returnUrl, currentRoute)) {
            return;
          }

          if (this.realm === 'client') {
            const mustOnboard = !!response.user.mustChangePassword || response.user.status === 0;
            const destination = mustOnboard ? '/client/onboarding' : '/client/dashboard';
            this.authDebugLog.logLoginSuccess({
              realm: this.resolveDebugRealm(),
              route: currentRoute,
              destination
            });
            void this.router.navigate([destination]);
            return;
          }

          const destination = returnUrl || '/admin/dashboard';
          this.authDebugLog.logLoginSuccess({
            realm: this.resolveDebugRealm(),
            route: currentRoute,
            destination
          });
          void this.router.navigate([destination]);
        },
        error: (err) => {
          const backendMsg =
            err?.error?.errors?.[0]?.message ?? err?.error?.error ?? err?.message ?? '';
          const traceId = this.extractTraceId(err);
          const source = this.extractSource(err);
          const requestId = this.extractRequestId(err);
          const baseMeta = {
            realm: this.resolveDebugRealm(),
            route: currentRoute,
            status: typeof err?.status === 'number' ? err.status : undefined,
            url: typeof err?.url === 'string' ? err.url : undefined,
            requestId,
            traceId,
            source
          } as const;

          if (err?.status === 401) {
            this.errorMessage = 'E-mail ou senha invalidos. Confira os dados e tente novamente.';
            this.authDebugLog.logLoginError({
              ...baseMeta,
              reason: 'invalid_credentials',
              message: backendMsg || this.errorMessage
            });
            return;
          }

          if (this.isBackendUnavailableStatus(err?.status)) {
            this.errorMessage = this.backendOfflineMessage;
            this.saveBackendOfflineHint();
            this.authDebugLog.logLoginError({
              ...baseMeta,
              reason: 'backend_offline',
              message: this.errorMessage
            });
            return;
          }

          if (err?.status === 404) {
            this.errorMessage =
              'Endpoint de login nao encontrado. Em DEV, inicie o front com proxy (npm run start:client) e a API em http://localhost:5250.';
            this.authDebugLog.logLoginError({
              ...baseMeta,
              reason: 'endpoint_not_found',
              message: backendMsg || this.errorMessage
            });
            return;
          }

          if (err?.status === 429) {
            this.startRetryCooldown(this.extractRetryAfterSeconds(err));
            const waitMessage = this.retryAfterSeconds > 0 ? ` Aguarde ${this.retryAfterSeconds}s.` : '';
            const baseMessage = backendMsg || 'Muitas tentativas de login.';
            this.errorMessage = `${baseMessage}${waitMessage} Tente novamente.`;
            this.authDebugLog.logLoginError({
              ...baseMeta,
              reason: 'too_many_requests',
              message: backendMsg || this.errorMessage,
              retryAfterSeconds: this.retryAfterSeconds
            });
            return;
          }

          this.errorMessage = backendMsg || 'Nao foi possivel entrar. Tente novamente em instantes.';
          this.authDebugLog.logLoginError({
            ...baseMeta,
            reason: 'unexpected_login_error',
            message: backendMsg || this.errorMessage
          });
        }
      });
  }

  ngOnDestroy(): void {
    this.stopRetryCooldown();
  }

  private isBackendUnavailableStatus(status: unknown): boolean {
    return status === 0 || status === 502 || status === 503 || status === 504;
  }

  private applyBackendOfflineHintFromBootstrap(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const hint = window.sessionStorage.getItem(BACKEND_OFFLINE_HINT_KEY);
    if (hint && !this.errorMessage) {
      this.errorMessage = hint;
    }
  }

  private saveBackendOfflineHint(): void {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(BACKEND_OFFLINE_HINT_KEY, this.backendOfflineMessage);
    }
  }

  private clearBackendOfflineHint(): void {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(BACKEND_OFFLINE_HINT_KEY);
    }
  }

  private startRetryCooldown(seconds: number): void {
    const safeSeconds = Math.max(1, Number.isFinite(seconds) ? Math.round(seconds) : 30);
    this.retryAfterSeconds = safeSeconds;
    this.stopRetryTimer();
    this.retryTimerId = window.setInterval(() => {
      this.retryAfterSeconds = Math.max(0, this.retryAfterSeconds - 1);
      if (this.retryAfterSeconds === 0) {
        this.stopRetryTimer();
      }
    }, 1000);
  }

  private stopRetryCooldown(): void {
    this.retryAfterSeconds = 0;
    this.stopRetryTimer();
  }

  private stopRetryTimer(): void {
    if (this.retryTimerId !== null) {
      window.clearInterval(this.retryTimerId);
      this.retryTimerId = null;
    }
  }

  private extractRetryAfterSeconds(err: any): number {
    const retryAfterHeader = err?.headers?.get?.('Retry-After') ?? err?.headers?.get?.('retry-after');
    const retryAfterError = err?.error?.retryAfterSeconds ?? err?.error?.retryAfter;
    const rawValue = retryAfterHeader ?? retryAfterError;

    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return Math.max(1, Math.round(rawValue));
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      const asNumber = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(asNumber)) {
        return Math.max(1, asNumber);
      }

      const asDate = Date.parse(trimmed);
      if (!Number.isNaN(asDate)) {
        const secondsUntilDate = Math.ceil((asDate - Date.now()) / 1000);
        return Math.max(1, secondsUntilDate);
      }
    }

    return 30;
  }

  private extractTraceId(err: any): string | null {
    const traceFromBody = typeof err?.error?.traceId === 'string' ? err.error.traceId : null;
    const traceFromHeader = err?.headers?.get?.('X-Correlation-Id') ?? err?.headers?.get?.('x-correlation-id');
    return traceFromBody ?? (typeof traceFromHeader === 'string' ? traceFromHeader : null);
  }

  private extractRequestId(err: any): string | null {
    const requestId =
      err?.headers?.get?.('X-Request-Id') ??
      err?.headers?.get?.('x-request-id') ??
      err?.headers?.get?.('X-Correlation-Id') ??
      err?.headers?.get?.('x-correlation-id');
    return typeof requestId === 'string' ? requestId : null;
  }

  private extractSource(err: any): string | undefined {
    return typeof err?.error?.source === 'string' ? err.error.source : undefined;
  }

  private resolveDebugRealm(): 'admin' | 'client' {
    return this.realm === 'admin' ? 'admin' : 'client';
  }

  private resolveAccountType(response: any): 'admin' | 'client' | null {
    const raw =
      response?.accountType ??
      response?.AccountType ??
      response?.user?.accountType ??
      response?.user?.AccountType ??
      null;

    if (typeof raw !== 'string') {
      return null;
    }

    const normalized = raw.trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'platform') {
      return 'admin';
    }

    if (normalized === 'client' || normalized === 'tenant') {
      return 'client';
    }

    return null;
  }

  private handleCrossRealmLogin(
    accountType: 'admin' | 'client' | null,
    returnUrl: string | null,
    currentRoute: string
  ): boolean {
    if (!accountType || accountType === this.realm) {
      return false;
    }

    const targetRealm = accountType;
    const targetUrl = this.resolvePortalUrl(targetRealm, returnUrl);
    const reason =
      targetRealm === 'admin'
        ? 'admin_account_authenticated_on_client_app'
        : 'client_account_authenticated_on_admin_app';

    this.authDebugLog.logLoginError({
      realm: this.resolveDebugRealm(),
      route: currentRoute,
      reason,
      message: `Conta ${targetRealm} detectada no app ${this.realm}. Redirecionando para o portal correto.`,
      source: 'cross-realm-redirect'
    });

    // Keep session context clean before jumping to the other SPA.
    this.auth.clearSession();

    if (targetUrl) {
      window.location.assign(targetUrl);
      return true;
    }

    this.errorMessage =
      targetRealm === 'admin'
        ? 'Esta conta e de Admin. Acesse o painel admin na porta 4300.'
        : 'Esta conta e de Cliente. Acesse o painel client na porta 4200.';
    return true;
  }

  private resolvePortalUrl(targetRealm: 'admin' | 'client', returnUrl: string | null): string | null {
    const fallbackPath = '/login';
    const localPath =
      returnUrl && returnUrl.startsWith('/') && returnUrl !== '/login' ? returnUrl : fallbackPath;

    if (typeof window === 'undefined') {
      return null;
    }

    const { protocol, hostname } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isLocalHost) {
      return null;
    }

    const targetPort = targetRealm === 'admin' ? '4300' : '4200';
    return `${protocol}//${hostname}:${targetPort}${localPath}`;
  }
}
