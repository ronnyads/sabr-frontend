import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-phub-topbar',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './phub-topbar.component.html',
  styleUrls: ['./phub-topbar.component.scss']
})
export class PhubTopbarComponent {
  @Input() title = '';
  @Input() tenantBadgeText: string | null = null;
  @Input() userName = '';
  @Input() userSubtitle = '';
  @Input() redesignV1 = false;
  @Input() themeToggleEnabled = false;
  @Input() mobile = false;

  @Output() menuToggle = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

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
}
