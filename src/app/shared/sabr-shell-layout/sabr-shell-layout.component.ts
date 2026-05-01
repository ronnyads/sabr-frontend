import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { SabrMenuItem, SabrSidebarComponent } from '../sabr-sidebar/sabr-sidebar.component';
import { SabrTopbarComponent } from '../sabr-topbar/sabr-topbar.component';

@Component({
  selector: 'app-sabr-shell-layout',
  standalone: true,
  imports: [CommonModule, SabrSidebarComponent, SabrTopbarComponent],
  templateUrl: './sabr-shell-layout.component.html',
  styleUrls: ['./sabr-shell-layout.component.scss']
})
export class SabrShellLayoutComponent implements OnInit, OnChanges {
  @Input() appTitle = 'PrometheusHUB';
  @Input() appSubtitle = '';
  @Input() redesignV1 = false;
  @Input() darkModeEnabled = false;
  @Input() menuItems: SabrMenuItem[] = [];
  @Input() topbarTitle = '';
  @Input() tenantBadgeText: string | null = null;
  @Input() userName = '';
  @Input() userSubtitle = '';
  @Input() profileName = '';
  @Input() profileSubtitle = '';
  @Output() logout = new EventEmitter<void>();

  mobile = false;
  drawerOpen = false;

  constructor(private readonly themeService: ThemeService) {}

  ngOnInit(): void {
    this.syncViewport();
    this.themeService.initialize(this.darkModeEnabled);
  }

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
}
