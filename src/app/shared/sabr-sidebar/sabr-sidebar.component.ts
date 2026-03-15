import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';

export interface SabrMenuItem {
  label: string;
  link: string;
  icon?: string;
  exact?: boolean;
  disabled?: boolean;
}

@Component({
  selector: 'app-sabr-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, NbIconModule, NbButtonModule],
  templateUrl: './sabr-sidebar.component.html',
  styleUrls: ['./sabr-sidebar.component.scss']
})
export class SabrSidebarComponent {
  @Input() title = 'SABR';
  @Input() subtitle = '';
  @Input() redesignV1 = false;
  @Input() menuItems: SabrMenuItem[] = [];
  @Input() open = false;
  @Input() mobile = false;
  @Input() profileName = '';
  @Input() profileSubtitle = '';

  @Input() themeToggleEnabled = false;

  @Output() closeDrawer = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  profileMenuOpen = false;

  constructor(readonly themeService: ThemeService) {}

  get themeIcon(): string {
    return this.themeService.isDark ? 'sun-outline' : 'moon-outline';
  }

  get themeLabel(): string {
    return this.themeService.isDark ? 'Tema claro' : 'Tema escuro';
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.sabr-profile-wrap')) {
      this.profileMenuOpen = false;
    }
  }

  onNavigate(disabled?: boolean): void {
    if (disabled) {
      return;
    }

    this.navigate.emit();
  }
}
