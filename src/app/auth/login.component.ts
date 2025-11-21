import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  errorMessage = '';
  isSubmitting = false;
  unverifiedEmail = '';
  resendStatus: 'idle' | 'success' | 'error' = 'idle';
  resendMessage = '';
  isResending = false;

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required]]
  });

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
    }
  }

  submit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.authService.getErrorMessage(
          err,
          'Credenciais inválidas. Verifique email e senha.'
        );
        if (this.errorMessage.toLowerCase().includes('confirme seu email')) {
          this.unverifiedEmail = this.form.value.email ?? '';
        } else {
          this.unverifiedEmail = '';
          this.resendStatus = 'idle';
          this.resendMessage = '';
        }
      }
    });
  }

  resendVerification(): void {
    const email = this.unverifiedEmail || this.form.value.email;
    if (!email || this.isResending) {
      return;
    }

    this.isResending = true;
    this.resendStatus = 'idle';
    this.resendMessage = '';

    this.authService.resendVerification(email).subscribe({
      next: () => {
        this.isResending = false;
        this.resendStatus = 'success';
        this.resendMessage = 'Enviamos um novo email de confirmação.';
      },
      error: (err) => {
        this.isResending = false;
        this.resendStatus = 'error';
        this.resendMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível reenviar agora.'
        );
      }
    });
  }

  goToVerify(): void {
    const email = this.unverifiedEmail || this.form.value.email;
    if (email) {
      this.router.navigate(['/verify-email'], { queryParams: { email } });
    } else {
      this.router.navigate(['/verify-email']);
    }
  }


  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  goToRecover(): void {
    this.router.navigate(['/recover']);
  }
}
