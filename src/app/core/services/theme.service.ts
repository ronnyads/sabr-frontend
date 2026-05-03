import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type PhubTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private static readonly THEME_STORAGE_KEY = 'phub.ui.theme.v1';
  private readonly themeSubject = new BehaviorSubject<PhubTheme>('light');
  private darkModeEnabled = false;

  get currentTheme(): PhubTheme {
    return this.themeSubject.value;
  }

  get isDark(): boolean {
    return this.currentTheme === 'dark';
  }

  get canToggle(): boolean {
    return this.darkModeEnabled;
  }

  initialize(darkModeEnabled: boolean): void {
    this.darkModeEnabled = darkModeEnabled;

    if (!darkModeEnabled) {
      this.setTheme('light', false);
      this.clearPersistedTheme();
      return;
    }

    const persistedTheme = this.readPersistedTheme();
    if (persistedTheme) {
      this.setTheme(persistedTheme, false);
      return;
    }

    this.setTheme(this.readPreferredTheme(), false);
  }

  toggleTheme(): void {
    if (!this.darkModeEnabled) {
      return;
    }

    this.setTheme(this.isDark ? 'light' : 'dark');
  }

  private setTheme(theme: PhubTheme, persist = true): void {
    const resolvedTheme = this.darkModeEnabled ? theme : 'light';
    this.themeSubject.next(resolvedTheme);
    this.applyThemeAttribute(resolvedTheme);

    if (!this.darkModeEnabled) {
      this.clearPersistedTheme();
      return;
    }

    if (persist) {
      this.persistTheme(resolvedTheme);
    }
  }

  private applyThemeAttribute(theme: PhubTheme): void {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;

    document.body.classList.remove('phub-theme-light', 'phub-theme-dark');
    document.body.classList.add(`phub-theme-${theme}`);
  }

  private readPersistedTheme(): PhubTheme | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const raw = window.localStorage.getItem(ThemeService.THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') {
      return raw;
    }

    return null;
  }

  private persistTheme(theme: PhubTheme): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(ThemeService.THEME_STORAGE_KEY, theme);
  }

  private clearPersistedTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(ThemeService.THEME_STORAGE_KEY);
  }

  private readPreferredTheme(): PhubTheme {
    // Tema padrão sempre é light — o usuário pode alternar manualmente.
    // Não seguimos a preferência do SO para manter consistência visual da plataforma.
    return 'light';
  }
}
