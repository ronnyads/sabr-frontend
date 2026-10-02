import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { ThemeService } from '../../core/services/theme.service';
import { PhubMenuItem, PhubSidebarComponent } from '../phub-sidebar/phub-sidebar.component';
import { PhubTopbarComponent } from '../phub-topbar/phub-topbar.component';

@Component({
  selector: 'app-phub-shell-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, PhubSidebarComponent, PhubTopbarComponent],
  templateUrl: './phub-shell-layout.component.html',
  styleUrls: ['./phub-shell-layout.component.scss']
})
export class PhubShellLayoutComponent implements OnInit, OnChanges, OnDestroy {
  @Input() appTitle = 'PrometheusHUB';
  @Input() appSubtitle = '';
  @Input() redesignV1 = false;
  @Input() darkModeEnabled = false;
  @Input() menuItems: PhubMenuItem[] = [];
  @Input() topbarTitle = '';
  @Input() tenantBadgeText: string | null = null;
  @Input() userName = '';
  @Input() userSubtitle = '';
  @Input() profileName = '';
  @Input() profileSubtitle = '';
  @Input() walletBalanceLabel: string | null = null;
  @Input() breadcrumbsEnabled = false;
  @Output() logout = new EventEmitter<void>();

  mobile = false;
  drawerOpen = false;
  breadcrumbLabel = '';
  private routerSubscription?: Subscription;

  constructor(private readonly themeService: ThemeService, private readonly router: Router) {}

  ngOnInit(): void {
    this.syncViewport();
    this.themeService.initialize(this.darkModeEnabled);
    this.updateBreadcrumb(this.router.url);
    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateBreadcrumb(event.urlAfterRedirects));
  }

  ngOnDestroy(): void { this.routerSubscription?.unsubscribe(); }

  ngOnChanges(changes: SimpleChanges): void {
    const darkModeChange = changes['darkModeEnabled'];
    if (darkModeChange && !darkModeChange.firstChange) {
      this.themeService.initialize(this.darkModeEnabled);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.syncViewport();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer();
  }

  get sidebarOpen(): boolean {
    return !this.mobile || this.drawerOpen;
  }

  toggleDrawer(): void {
    if (!this.mobile) {
      return;
    }

    this.drawerOpen = !this.drawerOpen;
  }

  closeDrawer(): void {
    if (!this.mobile) {
      return;
    }

    this.drawerOpen = false;
  }

  private syncViewport(): void {
    this.mobile = window.innerWidth < 1024;
    if (!this.mobile) {
      this.drawerOpen = false;
    }
  }

  private updateBreadcrumb(url: string): void {
    const path = url.split('?')[0];
    if (path.includes('/catalog')) this.breadcrumbLabel = 'Catálogo';
    else if (path.includes('/my-products')) this.breadcrumbLabel = 'Meus produtos';
    else if (path.includes('/publications')) this.breadcrumbLabel = path.includes('/new') ? 'Nova publicação' : 'Publicações';
    else if (path.includes('/orders')) this.breadcrumbLabel = 'Meus pedidos';
    else if (path.includes('/wallet')) this.breadcrumbLabel = 'Carteira';
    else if (path.includes('/integrations')) this.breadcrumbLabel = 'Integrações';
    else this.breadcrumbLabel = 'Dashboard';
  }
}
