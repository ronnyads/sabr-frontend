import { Component, inject, signal } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  RouteConfigLoadEnd,
  RouteConfigLoadStart,
  Router,
  RouterOutlet
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {
  private readonly router = inject(Router);
  readonly routeLoading = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof RouteConfigLoadStart ||
            event instanceof RouteConfigLoadEnd ||
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError
        ),
        takeUntilDestroyed()
      )
      .subscribe((event) => {
        if (event instanceof RouteConfigLoadStart) {
          this.routeLoading.set(true);
          return;
        }

        this.routeLoading.set(false);
      });
  }
}
