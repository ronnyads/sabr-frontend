import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

type AuthDebugRealm = 'admin' | 'client' | 'supplier' | 'unknown';
type AuthDebugLevel = 'info' | 'warn' | 'error';

export interface AuthDebugLoginAttemptMeta {
  realm: AuthDebugRealm;
  route: string;
  returnUrl?: string | null;
}

export interface AuthDebugLoginSuccessMeta {
  realm: AuthDebugRealm;
  route: string;
  destination: string;
}

export interface AuthDebugLoginErrorMeta {
  realm: AuthDebugRealm;
  route: string;
  status?: number;
  url?: string;
  requestId?: string | null;
  traceId?: string | null;
  retryAfterSeconds?: number;
  source?: string;
  reason?: string;
  message?: string;
}

export interface AuthDebugGuardDecisionMeta {
  realm: AuthDebugRealm;
  guard: string;
  from: string;
  to?: string;
  decision: 'allow' | 'redirect';
  reason: string;
  accountTypeRaw?: string | null;
  roleNormalized?: number;
  inferredType?: string | null;
}

export interface AuthDebugNavigationErrorMeta {
  realm: AuthDebugRealm;
  from?: string;
  to?: string;
  reason: string;
  error?: unknown;
}

@Injectable({ providedIn: 'root' })
export class AuthDebugLogService {
  private readonly enabled =
    environment.production === false && environment.authDebugConsole !== false;

  logLoginAttempt(meta: AuthDebugLoginAttemptMeta): void {
    this.log('info', meta.realm, 'login_attempt', {
      route: meta.route,
      returnUrl: meta.returnUrl ?? null
    });
  }

  logLoginSuccess(meta: AuthDebugLoginSuccessMeta): void {
    this.log('info', meta.realm, 'login_success', {
      route: meta.route,
      destination: meta.destination
    });
  }

  logLoginError(meta: AuthDebugLoginErrorMeta): void {
    this.log('warn', meta.realm, 'login_error', {
      route: meta.route,
      status: meta.status,
      url: meta.url,
      requestId: meta.requestId ?? null,
      traceId: meta.traceId ?? null,
      retryAfterSeconds: meta.retryAfterSeconds,
      source: meta.source,
      reason: meta.reason,
      message: meta.message
    });
  }

  logGuardDecision(meta: AuthDebugGuardDecisionMeta): void {
    this.log('info', meta.realm, 'guard_decision', {
      guard: meta.guard,
      from: meta.from,
      to: meta.to ?? null,
      decision: meta.decision,
      reason: meta.reason,
      accountTypeRaw: meta.accountTypeRaw ?? null,
      roleNormalized: meta.roleNormalized,
      inferredType: meta.inferredType ?? null
    });
  }

  logGuardRedirect(meta: AuthDebugGuardDecisionMeta): void {
    this.logGuardDecision(meta);
  }

  logNavigationError(meta: AuthDebugNavigationErrorMeta): void {
    this.log('error', meta.realm, 'navigation_error', {
      from: meta.from ?? null,
      to: meta.to ?? null,
      reason: meta.reason,
      error: this.serializeError(meta.error)
    });
  }

  private log(level: AuthDebugLevel, realm: AuthDebugRealm, event: string, payload: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }

    const prefix = `[AUTH][${realm.toUpperCase()}] ${event}`;
    const sanitizedPayload = this.omitUndefined(payload);

    if (level === 'error') {
      console.error(prefix, sanitizedPayload);
      return;
    }

    if (level === 'warn') {
      console.warn(prefix, sanitizedPayload);
      return;
    }

    console.info(prefix, sanitizedPayload);
  }

  private serializeError(error: unknown): Record<string, unknown> | null {
    if (!error) {
      return null;
    }

    if (error instanceof Error) {
      return this.omitUndefined({
        name: error.name,
        message: error.message
      });
    }

    if (typeof error === 'object') {
      const candidate = error as { [key: string]: unknown };
      return this.omitUndefined({
        name: typeof candidate['name'] === 'string' ? candidate['name'] : undefined,
        message: typeof candidate['message'] === 'string' ? candidate['message'] : undefined,
        code: typeof candidate['code'] === 'string' || typeof candidate['code'] === 'number'
          ? candidate['code']
          : undefined
      });
    }

    return { message: String(error) };
  }

  private omitUndefined(payload: Record<string, unknown>): Record<string, unknown> {
    const compactEntries = Object.entries(payload).filter(([, value]) => value !== undefined);
    return Object.fromEntries(compactEntries);
  }
}
