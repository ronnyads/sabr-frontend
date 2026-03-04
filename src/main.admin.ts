import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { appConfigAdmin } from './app/app.config.admin';
import { App } from './app/app';
import { attachRouterObservability, captureFrontendError, initObservability } from './app/core/observability/observability';

initObservability('admin');

bootstrapApplication(App, appConfigAdmin)
  .then((appRef) => {
    const router = appRef.injector.get(Router);
    attachRouterObservability(router, 'admin');
  })
  .catch((err) => {
    captureFrontendError(err);
    console.error(err);
  });
