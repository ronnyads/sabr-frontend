import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { PhubMenuItem, PhubSidebarComponent } from '../phub-sidebar/phub-sidebar.component';
import { PhubTopbarComponent } from '../phub-topbar/phub-topbar.component';

@Component({
  selector: 'app-phub-shell-layout',
  standalone: true,
  imports: [CommonModule, PhubSidebarComponent, PhubTopbarComponent],
  templateUrl: './phub-shell-layout.component.html',
  styleUrls: ['./phub-shell-layout.component.scss']
})
export class PhubShellLayoutComponent implements OnInit, OnChanges {
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
