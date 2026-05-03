import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { NbLayoutModule, NbOverlayContainerAdapter } from '@nebular/theme';
import { Subject, filter, takeUntil } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';
import { roleLabelSystem } from '../core/utils/role-labels';
import { PhubMenuItem } from '../shared/phub-sidebar/phub-sidebar.component';
import { PhubShellLayoutComponent } from '../shared/phub-shell-layout/phub-shell-layout.component';
import { environment } from '../../environments/environment';

// Rotas que pertencem ao contexto de um cliente específico — NÃO limpam o contexto
const TENANT_SCOPED_PATTERNS = [
  /\/t\/[^/]+\//,             // /t/:tenantId/...
  /\/admin\/clients\/[^/]+\//, // /admin/clients/:clientId/...
];

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, NbLayoutModule, PhubShellLayoutComponent],
  templateUrl: './admin-shell.html',
  styleUrls: ['./admin-shell.scss']
})
export class AdminShell implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly shellRedesignV1 = !!environment.ui?.redesignShellV1;
  readonly darkModeEnabled = !!environment.ui?.darkModeV1;
  readonly menuItems: PhubMenuItem[] = [
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
    { label: 'Expedicao', icon: 'car-outline', link: '/fulfillment' },
    { label: 'Prompts de IA', icon: 'bulb-outline', link: '/ai-prompts' }
  ];

  constructor(
    private auth: AuthService,
    private readonly tenantContext: AdminTenantContextService,
    private readonly host: ElementRef<HTMLElement>,
    private readonly overlayContainer: NbOverlayContainerAdapter,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntil(this.destroy$))
      .subscribe((e) => {
        const isTenantScoped = TENANT_SCOPED_PATTERNS.some((p) => p.test(e.urlAfterRedirects));
        if (!isTenantScoped) {
          this.tenantContext.clear();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

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
    return label ? `Cliente: ${label}` : `Cliente: ${context.tenantId}`;
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.auth.redirectToLogin(),
      error: () => this.auth.redirectToLogin()
    });
  }
}
