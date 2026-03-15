import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  it('should force light theme and disable toggle when dark mode flag is disabled', () => {
    window.localStorage.setItem('sabr.ui.theme.v1', 'dark');

    service.initialize(false);

    expect(service.currentTheme).toBe('light');
    expect(service.canToggle).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('sabr.ui.theme.v1')).toBeNull();
  });

  it('should restore persisted theme when dark mode flag is enabled', () => {
    window.localStorage.setItem('sabr.ui.theme.v1', 'dark');

    service.initialize(true);

    expect(service.currentTheme).toBe('dark');
    expect(service.canToggle).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should toggle between light and dark when dark mode is enabled', () => {
    service.initialize(true);
    const initial = service.currentTheme;

    service.toggleTheme();

    const next = initial === 'light' ? 'dark' : 'light';
    expect(service.currentTheme).toBe(next);
    expect(window.localStorage.getItem('sabr.ui.theme.v1')).toBe(next);
    expect(document.documentElement.getAttribute('data-theme')).toBe(next);
  });
});
