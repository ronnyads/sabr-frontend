import { APP_INITIALIZER, ApplicationConfig, ErrorHandler, importProvidersFrom, inject } from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, Router, withNavigationErrorHandler } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { NbEvaIconsModule } from '@nebular/eva-icons';
import { NbMenuModule, NbSidebarModule, NbThemeModule, NbToastrModule } from '@nebular/theme';

import { adminRoutes } from './app.routes.admin';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { requestIdInterceptor } from './core/interceptors/request-id.interceptor';
import { adminTenantInterceptor } from './core/interceptors/admin-tenant.interceptor';
import { apiCredentialsInterceptor } from './core/interceptors/api-credentials.interceptor';
import { CsrfService } from './core/services/csrf.service';
import { AuthDebugLogService } from './core/services/auth-debug-log.service';
import { AUTH_REALM } from './core/tokens/auth-realm';
import { GlobalErrorHandler } from './core/observability/global-error.handler';

export const appConfigAdmin: ApplicationConfig = {
  providers: [
    provideRouter(
      adminRoutes,
      withNavigationErrorHandler((error) => {
        const authDebugLog = inject(AuthDebugLogService);
        const router = inject(Router);
        const target =
          typeof (error as any)?.url === 'string'
            ? (error as any).url
            : typeof (error as any)?.urlAfterRedirects === 'string'
              ? (error as any).urlAfterRedirects
              : undefined;

        authDebugLog.logNavigationError({
          realm: 'admin',
          from: router.url,
          to: target,
          reason: 'router_navigation_error',
          error
        });
      })
    ),
    provideAnimations(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideHttpClient(
      withInterceptors([
        apiCredentialsInterceptor,
        requestIdInterceptor,
        adminTenantInterceptor,
        authInterceptor,
        errorInterceptor
      ]),
      withXsrfConfiguration({
        cookieName: 'XSRF-ADMIN',
        headerName: 'X-XSRF-ADMIN'
      })
    ),
    { provide: AUTH_REALM, useValue: 'admin' },
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
