import { DEFAULT_CURRENCY_CODE } from '@angular/core';
import { APP_INITIALIZER, ApplicationConfig, ErrorHandler, importProvidersFrom, LOCALE_ID } from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { NbEvaIconsModule } from '@nebular/eva-icons';
import { NbMenuModule, NbSidebarModule, NbThemeModule, NbToastrModule } from '@nebular/theme';

import { clientRoutes } from './app.routes.client';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { requestIdInterceptor } from './core/interceptors/request-id.interceptor';
import { tenantInterceptor } from './core/interceptors/tenant.interceptor';
import { apiCredentialsInterceptor } from './core/interceptors/api-credentials.interceptor';
import { CsrfService } from './core/services/csrf.service';
import { AUTH_REALM } from './core/tokens/auth-realm';
import { GlobalErrorHandler } from './core/observability/global-error.handler';

export const appConfigClient: ApplicationConfig = {
  providers: [
    provideRouter(clientRoutes),
    provideAnimations(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' },
    provideHttpClient(
      withInterceptors([
        apiCredentialsInterceptor,
        requestIdInterceptor,
        tenantInterceptor,
        authInterceptor,
        errorInterceptor
      ]),
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN'
      })
    ),
    { provide: AUTH_REALM, useValue: 'client' },
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [CsrfService],
      useFactory: (csrf: CsrfService) => () => csrf.init().catch(() => void 0)
    },
    importProvidersFrom(
      NbThemeModule.forRoot({ name: 'default' }),
      NbSidebarModule.forRoot(),
      NbMenuModule.forRoot(),
      NbToastrModule.forRoot(),
      NbEvaIconsModule
    )
  ]
};
