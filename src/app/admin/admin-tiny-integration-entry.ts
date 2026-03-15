import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NbToastrService } from '@nebular/theme';
import { AdminTenantContextService } from '../core/services/admin-tenant-context.service';

@Component({
  selector: 'app-admin-tiny-integration-entry',
  standalone: true,
  template: ''
})
export class AdminTinyIntegrationEntry implements OnInit {
  constructor(
    private readonly tenantContext: AdminTenantContextService,
    private readonly router: Router,
    private readonly toastr: NbToastrService
  ) {}

  ngOnInit(): void {
    const context = this.tenantContext.get();
    if (!context?.tenantId || !context.clientId) {
      this.toastr.warning('Selecione um cliente antes de abrir Integracoes.', 'Contexto obrigatorio');
      void this.router.navigate(['/clients']);
      return;
    }

    void this.router.navigate(
      [`/t/${context.tenantId}/clients/${context.clientId}/integrations/tinyerp`],
      { replaceUrl: true }
    );
  }
}
