import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NbButtonModule, NbIconModule } from '@nebular/theme';

@Component({
  selector: 'app-sabr-topbar',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule],
  templateUrl: './sabr-topbar.component.html',
  styleUrls: ['./sabr-topbar.component.scss']
})
export class SabrTopbarComponent {
  @Input() title = '';
  @Input() tenantBadgeText: string | null = null;
  @Input() userName = '';
  @Input() userSubtitle = '';
  @Input() mobile = false;

  @Output() menuToggle = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();
}
