import { Routes } from '@angular/router';
import { supplierGuard } from './core/guards/supplier.guard';
import { authGuard } from './core/guards/auth.guard';

export const supplierRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./supplier/supplier-login/supplier-login').then((m) => m.SupplierLogin)
  },
  {
    path: '',
    loadComponent: () => import('./supplier/supplier-shell/supplier-shell').then((m) => m.SupplierShell),
    canActivate: [authGuard, supplierGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./supplier/supplier-dashboard/supplier-dashboard').then((m) => m.SupplierDashboard)
      },
      {
        path: 'products',
        loadComponent: () => import('./supplier/supplier-products/supplier-products').then((m) => m.SupplierProducts)
      },
      {
        path: 'wallet',
        loadComponent: () => import('./supplier/supplier-wallet/supplier-wallet').then((m) => m.SupplierWallet)
      },
      {
        path: 'withdrawals',
        loadComponent: () => import('./supplier/supplier-withdrawals/supplier-withdrawals').then((m) => m.SupplierWithdrawals)
      },
      {
        path: 'settings',
        loadComponent: () => import('./supplier/supplier-settings/supplier-settings').then((m) => m.SupplierSettings)
      }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
