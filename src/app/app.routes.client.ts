import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { clientGuard } from './core/guards/client.guard';
import { clientOnboardingGuard } from './core/guards/client-onboarding.guard';

export const clientRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  {
    path: 'client/onboarding',
    loadComponent: () => import('./client/client-onboarding').then((m) => m.ClientOnboarding),
    canActivate: [authGuard, clientGuard]
  },
  {
    path: 'client',
    loadComponent: () => import('./client/client-shell').then((m) => m.ClientShell),
    canActivate: [authGuard, clientGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./client/client-dashboard').then((m) => m.ClientDashboard),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'catalog',
        loadComponent: () => import('./client/client-catalog').then((m) => m.ClientCatalog),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'my-products',
        loadComponent: () => import('./client/client-my-products').then((m) => m.ClientMyProducts),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'publications',
        loadComponent: () =>
          import('./client/publications/client-publications.page').then((m) => m.ClientPublicationsPage),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'publications/new',
        loadComponent: () =>
          import('./client/publications/client-publication-wizard.page').then((m) => m.ClientPublicationWizardPage),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'publications/:draftId',
        loadComponent: () =>
          import('./client/publications/client-publication-wizard.page').then((m) => m.ClientPublicationWizardPage),
        canActivate: [clientOnboardingGuard]
      },
      {
        path: 'integrations/mercadolivre',
        loadComponent: () => import('./client/client-ml-integration').then((m) => m.ClientMlIntegration),
        canActivate: [clientOnboardingGuard]
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '', pathMatch: 'full', redirectTo: 'client/dashboard' },
  { path: '**', redirectTo: 'client/dashboard' }
];
