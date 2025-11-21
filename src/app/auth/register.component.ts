import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent implements OnInit {
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
    confirmacao: ['', [Validators.required]]
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
    if (this.isSubmitting) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid || this.form.value.senha !== this.form.value.confirmacao) {
      this.errorMessage = this.form.value.senha !== this.form.value.confirmacao
        ? 'As senhas não coincidem.'
        : 'Preencha todos os campos corretamente.';
      return;
    }

    const { nome, email, senha } = this.form.getRawValue();

    this.isSubmitting = true;
    this.errorMessage = '';

    this.authService.register({ nome, email, senha }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Conta criada! Enviamos um email para confirmação.';
        setTimeout(() => {
          this.router.navigate(['/verify-email'], {
            queryParams: { email },
            state: { fromRegister: true }
          });
        }, 800);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível criar a conta. Verifique os dados e tente novamente.'
        );
      }
    });
  }

  voltarParaLogin(): void {
    this.router.navigate(['/login']);
  }
}
