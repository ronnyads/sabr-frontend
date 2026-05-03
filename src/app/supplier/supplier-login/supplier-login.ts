import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  NbButtonModule,
  NbCardModule,
  NbIconModule,
  NbInputModule,
  NbLayoutModule
} from '@nebular/theme';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-supplier-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NbLayoutModule,
    NbCardModule,
    NbInputModule,
    NbButtonModule,
    NbIconModule
  ],
  templateUrl: './supplier-login.html',
  styleUrls: ['./supplier-login.scss']
})
export class SupplierLogin implements OnDestroy {
  form: FormGroup;
  loading = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  ngOnDestroy(): void {}

  submit(): void {
    if (this.form.invalid || this.loading) return;

    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.form.value;
    this.auth
      .login(email, password)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => void this.router.navigate(['/dashboard']),
        error: () => (this.errorMessage = 'E-mail ou senha inválidos.')
      });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }
}
