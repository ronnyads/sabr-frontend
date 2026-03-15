import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NbLayoutModule, NbOverlayContainerAdapter } from '@nebular/theme';
import { AuthService } from '../core/services/auth.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { roleLabelSystem } from '../core/utils/role-labels';
import { SabrMenuItem } from '../shared/sabr-sidebar/sabr-sidebar.component';
import { SabrShellLayoutComponent } from '../shared/sabr-shell-layout/sabr-shell-layout.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NbLayoutModule, SabrShellLayoutComponent],
  templateUrl: './admin-shell.html',
  styleUrls: ['./admin-shell.scss']
})
export class AdminShell implements AfterViewInit {
  readonly shellRedesignV1 = !!environment.ui?.redesignShellV1;
  readonly darkModeEnabled = !!environment.ui?.darkModeV1;
  readonly menuItems: SabrMenuItem[] = [
    { label: 'Dashboard', icon: 'home-outline', link: '/dashboard', exact: true },
    { label: 'Clientes', icon: 'people-outline', link: '/clients' },
    // Platform users (Admin/SuperAdmin/Finance).
    { label: 'Usuarios do Sistema', icon: 'person-outline', link: '/users' },
    { label: 'Produtos', icon: 'cube-outline', link: '/products' },
    { label: 'Categorias', icon: 'pricetags-outline', link: '/categories' },
    { label: 'Catalogos', icon: 'grid-outline', link: '/catalogs' },
    { label: 'Planos', icon: 'layers-outline', link: '/plans' },
    { label: 'Integrações', icon: 'link-2-outline', link: '/integrations' },
    { label: 'Pedidos', icon: 'shopping-bag-outline', link: '/orders' },
    { label: 'Expedicao', icon: 'car-outline', link: '/fulfillment' }
  ];

  constructor(
    private auth: AuthService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly overlayContainer: NbOverlayContainerAdapter,
  ) {}

  ngAfterViewInit(): void {
    const layout = this.host.nativeElement.querySelector('nb-layout');
    if (layout) {
      this.overlayContainer.setContainer(layout as HTMLElement);
    }
  }

  get currentUserName(): string {
    return this.auth.currentUser?.name ?? 'Admin';
  }

  get currentUserRole(): string {
    const role = this.auth.currentUser?.role;
    if (role == null) {
      return 'Admin Console';
    }

    const normalized = String(role).trim();
    if (!normalized) {
      return 'Admin Console';
    }

    const label = roleLabelSystem(role);
    return label.startsWith('Desconhecido') ? 'Admin Console' : label;
  }

  get tenantBadgeText(): string {
    const context = this.tenantContext.get();
    if (!context?.tenantId) {
      return 'Contexto: Global';
    }

    const label = context.label?.trim();
    return label ? `Cliente: ${label} • ${context.tenantId}` : `Tenant: ${context.tenantId}`;
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.auth.redirectToLogin(),
      error: () => this.auth.redirectToLogin()
    });
  }
}
