import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-recover',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './recover.component.html',
  styleUrl: './recover.component.css'
})
export class RecoverComponent {
  isSubmitting = false;
  successMessage = '';
  errorMessage = '';

  private readonly formBuilder = inject(FormBuilder);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  submit(): void {
    if (this.isSubmitting) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.successMessage = '';
    this.errorMessage = '';

    const { email } = this.form.getRawValue();
    this.authService.requestPasswordRecovery(email).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.successMessage = 'Se o email estiver cadastrado, você receberá um código e um link para definir uma nova senha.';
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = this.authService.getErrorMessage(
          err,
          'Não foi possível enviar o email. Tente novamente em alguns instantes.'
        );
      }
    });
  }

  voltarParaLogin(): void {
    this.router.navigate(['/login']);
  }

  tenhoCodigo(): void {
    this.router.navigate(['/reset']);
  }

}
