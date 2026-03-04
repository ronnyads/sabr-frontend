import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbIconModule } from '@nebular/theme';

export interface SearchToolbarFilterOption {
  label: string;
  value: string;
}

export interface SearchToolbarFilter {
  id: string;
  label: string;
  value: string;
  options: SearchToolbarFilterOption[];
}

@Component({
  selector: 'app-search-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, NbIconModule],
  templateUrl: './search-toolbar.component.html',
  styleUrls: ['./search-toolbar.component.scss']
})
export class SearchToolbarComponent implements OnChanges {
  @Input() placeholder = 'Buscar...';
  @Input() value = '';
  @Input() filters: SearchToolbarFilter[] = [];

  @Output() searchChange = new EventEmitter<string>();
  @Output() filterChange = new EventEmitter<{ id: string; value: string }>();
  @Output() clear = new EventEmitter<void>();

  searchValue = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      const incoming = this.value ?? '';
      if (incoming !== this.searchValue) {
        this.searchValue = incoming;
      }
    }
  }

  onSearchChanged(value: string): void {
    this.searchChange.emit(value ?? '');
  }

  onFilterChanged(filterId: string, event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const value = target?.value ?? '';
    this.filterChange.emit({ id: filterId, value });
  }

  onClear(): void {
    this.searchValue = '';
    this.searchChange.emit('');
    this.clear.emit();
  }

  trackByFilterId(_: number, filter: SearchToolbarFilter): string {
    return filter.id;
  }

  trackByOptionValue(_: number, option: SearchToolbarFilterOption): string {
    return option.value;
  }
}
