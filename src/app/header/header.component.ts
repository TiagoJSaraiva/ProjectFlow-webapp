import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DEMO_MODE } from '../shared/api-config';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../shared/auth/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  readonly demoMode = inject(DEMO_MODE);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  get isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  get userName(): string | null {
    return this.authService.currentSession()?.nome ?? null;
  }

  logout(): void {
    this.router
      .navigate(['/login'])
      .then((navigated) => {
        if (navigated) {
          this.authService.logout();
        }
      })
      .catch(() => undefined);
  }
}
