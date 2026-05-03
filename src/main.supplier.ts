import { registerLocaleData } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import localePt from '@angular/common/locales/pt';
import { appConfigSupplier } from './app/app.config.supplier';
import { App } from './app/app';
import { attachRouterObservability, captureFrontendError, initObservability } from './app/core/observability/observability';

registerLocaleData(localePt);
initObservability('supplier');

bootstrapApplication(App, appConfigSupplier)
  .then((appRef) => {
    const router = appRef.injector.get(Router);
    attachRouterObservability(router, 'supplier');
  })
  .catch((err) => {
    captureFrontendError(err);
    console.error(err);
  });
