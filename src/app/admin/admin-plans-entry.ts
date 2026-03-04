import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbToastrService } from '@nebular/theme';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';

@Component({
  selector: 'app-admin-plans-entry',
  standalone: true,
  template: ''
})
export class AdminPlansEntry implements OnInit {
  constructor(
    private readonly tenantContext: AdminTenantContextService,
    private readonly router: Router,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    const context = this.tenantContext.get();
    if (!context?.tenantId) {
      this.toastr.warning('Selecione um cliente/tenant antes de abrir Planos.', 'Tenant obrigatorio');
      void this.router.navigate(['/clients']);
      return;
    }

    void this.router.navigate([`/t/${context.tenantId}/plans`], { replaceUrl: true });
  }
}
