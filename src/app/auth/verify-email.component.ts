import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.css'
})
export class VerifyEmailComponent implements OnInit {
  verifying = false;
  verificationStatus: 'idle' | 'success' | 'error' = 'idle';
  verificationMessage = '';
  isResending = false;
  resendStatus: 'idle' | 'success' | 'error' = 'idle';
  resendMessage = '';
  infoEmail = '';

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  constructor(
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    const navEmail = this.router.getCurrentNavigation()?.extras.state?.['email'] as string | undefined;
    const emailFromQuery = this.route.snapshot.queryParamMap.get('email') ?? undefined;
    this.infoEmail = navEmail ?? emailFromQuery ?? '';

    if (this.infoEmail) {
      this.form.patchValue({ email: this.infoEmail });
    }

    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.confirmEmail(token);
    }
  }

  confirmEmail(token: string): void {
    if (!token) {
      return;
    }

    this.verifying = true;
    this.verificationStatus = 'idle';
    this.verificationMessage = '';

    this.authService.verifyEmail(token).subscribe({
      next: () => {
        this.verifying = false;
        this.verificationStatus = 'success';
        this.verificationMessage = 'Email confirmado com sucesso! Você já pode entrar.';
        if (!this.infoEmail) {
          this.infoEmail = this.form.value.email ?? '';
        }
        setTimeout(() => this.router.navigate(['/login']), 1200);
      },
      error: (err) => {
        this.verifying = false;
        this.verificationStatus = 'error';
        this.verificationMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível confirmar o email.'
        );
      }
    });
  }

  resend(): void {
    if (this.isResending || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email } = this.form.getRawValue();
    this.isResending = true;
    this.resendStatus = 'idle';
    this.resendMessage = '';

    this.authService.resendVerification(email).subscribe({
      next: () => {
        this.isResending = false;
        this.resendStatus = 'success';
        this.resendMessage = 'Enviamos um novo email de confirmação. Verifique sua caixa de entrada.';
      },
      error: (err) => {
        this.isResending = false;
        this.resendStatus = 'error';
        this.resendMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível reenviar o email agora.'
        );
      }
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
