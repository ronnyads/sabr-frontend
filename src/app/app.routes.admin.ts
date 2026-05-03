import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const adminRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  {
    path: '',
    loadComponent: () => import('./admin/admin-shell').then((m) => m.AdminShell),
    canActivate: [authGuard, adminGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./admin/admin-dashboard').then((m) => m.AdminDashboard) },
      // Platform pages (current model is 1 client per tenant)
      { path: 'clients', loadComponent: () => import('./clients/clients').then((m) => m.Clients) },
      { path: 'tenants', pathMatch: 'full', redirectTo: 'clients' },

      // Platform users (Admin/SuperAdmin/Finance)
      { path: 'users', loadComponent: () => import('./admin/platform-users').then((m) => m.PlatformUsers) },
      { path: 'suppliers', loadComponent: () => import('./admin/admin-suppliers').then((m) => m.AdminSuppliers) },
      { path: 'products', loadComponent: () => import('./admin/admin-products').then((m) => m.AdminProducts) },
      {
        path: 'categories',
        loadComponent: () => import('./admin/admin-categories').then((m) => m.AdminCategories)
      },
      {
        path: 'catalogs',
        loadComponent: () => import('./admin/admin-global-catalogs').then((m) => m.AdminGlobalCatalogs)
      },
      { path: 'plans', loadComponent: () => import('./admin/admin-plans').then((m) => m.AdminPlans) },
      {
        path: 'integrations',
        loadComponent: () => import('./admin/admin-integrations-hub').then((m) => m.AdminIntegrationsHub)
      },
      {
        path: 'integrations/:provider',
        loadComponent: () => import('./admin/admin-integrations-detail').then((m) => m.AdminIntegrationsDetail)
      },
      { path: 'orders', loadComponent: () => import('./admin/admin-orders').then((m) => m.AdminOrders) },
      { path: 'fulfillment', loadComponent: () => import('./admin/admin-fulfillment').then((m) => m.AdminFulfillment) },
      { path: 'ai-prompts', loadComponent: () => import('./admin/admin-ai-prompts').then((m) => m.AdminAiPrompts) },

      // Client-scoped admin pages (clientId in URL, tenant from context)
      {
        path: 'admin/clients/:clientId/subscriptions',
        loadComponent: () =>
          import('./admin/admin-client-plan-subscriptions').then((m) => m.AdminClientPlanSubscriptions)
      },
      {
        path: 'admin/clients/:clientId/integrations/mercadolivre',
        loadComponent: () => import('./admin/admin-ml-integrations').then((m) => m.AdminMlIntegrations)
      },
      {
        path: 'admin/clients/:clientId/integrations/tinyerp',
        loadComponent: () => import('./admin/admin-tiny-integration').then((m) => m.AdminTinyIntegration)
      },

      // Legacy tenant-scoped routes (backward compat — kept for existing bookmarks)
      { path: 't/:tenantId/users', loadComponent: () => import('./users/users').then((m) => m.Users) },
      {
        path: 't/:tenantId/catalogs',
        loadComponent: () => import('./admin/admin-catalogs').then((m) => m.AdminCatalogs)
      },
      { path: 't/:tenantId/plans', loadComponent: () => import('./admin/admin-plans').then((m) => m.AdminPlans) },
      {
        path: 't/:tenantId/clients/:clientId/plans',
        loadComponent: () =>
          import('./admin/admin-client-plan-subscriptions').then((m) => m.AdminClientPlanSubscriptions)
      },
      {
        path: 't/:tenantId/clients/:clientId/integrations/mercadolivre',
        loadComponent: () => import('./admin/admin-ml-integrations').then((m) => m.AdminMlIntegrations)
      },
      {
        path: 't/:tenantId/clients/:clientId/integrations/tinyerp',
        loadComponent: () => import('./admin/admin-tiny-integration').then((m) => m.AdminTinyIntegration)
      },

      // Aliases with /admin prefix (compatibility + explicit contract)
      { path: 'admin', pathMatch: 'full', redirectTo: 'admin/dashboard' },
      {
        path: 'admin/dashboard',
        loadComponent: () => import('./admin/admin-dashboard').then((m) => m.AdminDashboard)
      },
      { path: 'admin/clients', loadComponent: () => import('./clients/clients').then((m) => m.Clients) },
      {
        path: 'admin/users',
        loadComponent: () => import('./admin/platform-users').then((m) => m.PlatformUsers)
      },
      { path: 'admin/suppliers', loadComponent: () => import('./admin/admin-suppliers').then((m) => m.AdminSuppliers) },
      {
        path: 'admin/products',
        loadComponent: () => import('./admin/admin-products').then((m) => m.AdminProducts)
      },
      {
        path: 'admin/categories',
        loadComponent: () => import('./admin/admin-categories').then((m) => m.AdminCategories)
      },
      {
        path: 'admin/catalogs',
        loadComponent: () => import('./admin/admin-global-catalogs').then((m) => m.AdminGlobalCatalogs)
      },
      {
        path: 'admin/plans',
        loadComponent: () => import('./admin/admin-plans-entry').then((m) => m.AdminPlansEntry)
      },
      {
        path: 'admin/integrations',
        loadComponent: () => import('./admin/admin-integrations-hub').then((m) => m.AdminIntegrationsHub)
      },
      {
        path: 'admin/ai-prompts',
        loadComponent: () => import('./admin/admin-ai-prompts').then((m) => m.AdminAiPrompts)
      },
      { path: 'admin/plans/detail', loadComponent: () => import('./admin/admin-plans').then((m) => m.AdminPlans) },
      { path: 'admin/t/:tenantId/users', loadComponent: () => import('./users/users').then((m) => m.Users) },
      {
        path: 'admin/t/:tenantId/catalogs',
        loadComponent: () => import('./admin/admin-catalogs').then((m) => m.AdminCatalogs)
      },
      {
        path: 'admin/t/:tenantId/plans',
        loadComponent: () => import('./admin/admin-plans').then((m) => m.AdminPlans)
      },
      {
        path: 'admin/t/:tenantId/clients/:clientId/plans',
        loadComponent: () =>
          import('./admin/admin-client-plan-subscriptions').then((m) => m.AdminClientPlanSubscriptions)
      },
      {
        path: 'admin/t/:tenantId/clients/:clientId/integrations/mercadolivre',
        loadComponent: () => import('./admin/admin-ml-integrations').then((m) => m.AdminMlIntegrations)
      },

      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
