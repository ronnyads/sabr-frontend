import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-users-entry',
  standalone: true,
  template: `<p style="padding: 16px;">Redirecionando...</p>`
})
export class AdminUsersEntry implements OnInit {
  private readonly storageKey = 'phub:admin:lastTenantId';

  constructor(private router: Router) {}

  ngOnInit(): void {
    const tenantId = localStorage.getItem(this.storageKey) ?? '';
    if (tenantId.trim()) {
      void this.router.navigate(['/t', tenantId, 'users']);
      return;
    }

    void this.router.navigate(['/clients']);
  }
}

