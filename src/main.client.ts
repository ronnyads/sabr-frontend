import { registerLocaleData } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import localePt from '@angular/common/locales/pt';
import { appConfigClient } from './app/app.config.client';
import { App } from './app/app';
import { attachRouterObservability, captureFrontendError, initObservability } from './app/core/observability/observability';

registerLocaleData(localePt);
initObservability('client');

bootstrapApplication(App, appConfigClient)
  .then((appRef) => {
    const router = appRef.injector.get(Router);
    attachRouterObservability(router, 'client');
  })
  .catch((err) => {
    captureFrontendError(err);
    console.error(err);
  });
