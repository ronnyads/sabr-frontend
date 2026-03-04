import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NbIconModule } from '@nebular/theme';

export interface RowActionMenuAction {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
}

@Component({
  selector: 'app-row-actions-menu',
  standalone: true,
  imports: [CommonModule, NbIconModule],
  templateUrl: './row-actions-menu.component.html',
  styleUrls: ['./row-actions-menu.component.scss']
})
export class RowActionsMenuComponent {
  @Input() actions: RowActionMenuAction[] = [];
  @Input() ariaLabel = 'Abrir acoes da linha';
  @Output() actionClick = new EventEmitter<string>();

  open = false;

  constructor(private readonly hostRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  toggle(event: Event): void {
    event.stopPropagation();
    this.open = !this.open;
  }

  onActionClick(action: RowActionMenuAction): void {
    if (action.disabled) {
      return;
    }

    this.open = false;
    this.actionClick.emit(action.id);
  }
}
