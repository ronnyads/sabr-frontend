import { NavigationEnd, Router } from '@angular/router';
import * as Sentry from '@sentry/browser';
import { filter } from 'rxjs';
import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';
import { environment } from '../../../environments/environment';

export type AppRealm = 'client' | 'admin';

let sentryInitialized = false;
let webVitalsInitialized = false;

function getRuntimeConfig() {
  return environment.observability ?? {};
}

function shouldUseSentry(): boolean {
  const dsn = getRuntimeConfig().sentryDsn;
  return Boolean(getRuntimeConfig().enabled && dsn && dsn.trim().length > 0);
}

function reportWebVital(metric: Metric, realm: AppRealm): void {
  const payload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    realm,
    route: typeof window !== 'undefined' ? window.location.pathname : ''
  };

  if (shouldUseSentry()) {
    Sentry.captureMessage('web-vital', {
      level: 'info',
      tags: {
        realm,
        metric: metric.name,
        route: payload.route
      },
      extra: payload
    });
  }

  if (getRuntimeConfig().consoleMetrics) {
    console.info('[web-vitals]', payload);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('phub:web-vital', { detail: payload }));
  }
}

function initWebVitals(realm: AppRealm): void {
  if (webVitalsInitialized || !getRuntimeConfig().webVitalsEnabled) {
    return;
  }

  webVitalsInitialized = true;
  onCLS((metric) => reportWebVital(metric, realm));
  onINP((metric) => reportWebVital(metric, realm));
  onLCP((metric) => reportWebVital(metric, realm));
}

export function initObservability(realm: AppRealm): void {
  if (!getRuntimeConfig().enabled) {
    return;
  }

  if (shouldUseSentry() && !sentryInitialized) {
    sentryInitialized = true;
    Sentry.init({
      dsn: getRuntimeConfig().sentryDsn,
      environment: environment.production ? 'production' : 'development',
      release: getRuntimeConfig().release || undefined,
      tracesSampleRate: getRuntimeConfig().tracesSampleRate ?? 0.1,
      beforeSend(event) {
        event.tags = { ...(event.tags ?? {}), realm };
        return event;
      }
    });
  }

  if (shouldUseSentry()) {
    Sentry.setTag('realm', realm);
    Sentry.setTag('app', 'phub-frontend');
  }

  initWebVitals(realm);
}

export function attachRouterObservability(router: Router, realm: AppRealm): void {
  router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe((event) => {
      const route = event.urlAfterRedirects;

      if (shouldUseSentry()) {
        Sentry.setTag('route', route);
        Sentry.addBreadcrumb({
          category: 'navigation',
          message: route,
          level: 'info',
          data: { realm }
        });
      }

      if (getRuntimeConfig().consoleMetrics) {
        console.info('[navigation]', { realm, route });
      }
    });
}

export function captureFrontendError(error: unknown): void {
  if (shouldUseSentry()) {
    Sentry.captureException(error);
  }
}
