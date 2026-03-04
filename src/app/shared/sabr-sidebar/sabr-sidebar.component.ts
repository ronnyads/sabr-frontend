import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
  @Input() menuItems: SabrMenuItem[] = [];
  @Input() open = false;
  @Input() mobile = false;
  @Input() profileName = '';
  @Input() profileSubtitle = '';

  @Output() closeDrawer = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<void>();

  onNavigate(disabled?: boolean): void {
    if (disabled) {
      return;
    }

    this.navigate.emit();
  }
}
