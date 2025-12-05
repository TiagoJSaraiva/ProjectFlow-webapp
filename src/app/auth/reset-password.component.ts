import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css'
})
export class ResetPasswordComponent implements OnInit {
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    token: ['', [Validators.required]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
    confirmacao: ['', [Validators.required]]
  });

  constructor(
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.form.patchValue({ token });
    }
  }

  submit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    if (this.form.value.senha !== this.form.value.confirmacao) {
      this.errorMessage = 'As senhas precisam ser iguais.';
      return;
    }

    const { token, senha } = this.form.getRawValue();
    this.isSubmitting = true;
    this.errorMessage = '';

    this.authService.resetPassword({ token, novaSenha: senha }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Senha atualizada com sucesso! Você já pode fazer login.';
        setTimeout(() => this.router.navigate(['/login']), 1200);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível redefinir a senha. Verifique o código e tente novamente.'
        );
      }
    });
  }

  goToRecover(): void {
    this.router.navigate(['/recover']);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
