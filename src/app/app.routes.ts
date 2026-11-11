import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { RecoverComponent } from './auth/recover.component';
import { RegisterComponent } from './auth/register.component';
import { ResetPasswordComponent } from './auth/reset-password.component';
import { VerifyEmailComponent } from './auth/verify-email.component';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { authGuard } from './shared/auth/auth.guard';
import { projectBoardPendingChangesGuard } from './project-board/project-board-pending-changes.guard';
import { environment } from '../environments/environment';


const AUTH_PATHS = ['login', 'register', 'recover', 'reset', 'verify-email'];

/** No modo demonstração não há conta: as rotas de autenticação redirecionam para a lista de projetos. */
export function buildRoutes(demoMode: boolean): Routes {
	const routes: Routes = [
		{
			path: 'login',
			component: LoginComponent
		},
		{
			path: 'register',
			component: RegisterComponent
		},
		{
			path: 'recover',
			component: RecoverComponent
		},
		{
			path: 'reset',
			component: ResetPasswordComponent
		},
		{
			path: 'verify-email',
			component: VerifyEmailComponent
		},
		{
			path: '',
			component: LandingPageComponent,
			canActivate: [authGuard],
			pathMatch: 'full'
		},
		{
			path: 'projects/:id/board',
			loadComponent: () => import('./project-board/project-board.component').then((m) => m.ProjectBoardComponent),
			canActivate: [authGuard],
			canDeactivate: [projectBoardPendingChangesGuard]
		},
		{
			path: '**',
			redirectTo: ''
		}
	];
	return demoMode ? routes.map((route) => (AUTH_PATHS.includes(route.path ?? '') ? { path: route.path, redirectTo: '', pathMatch: 'full' as const } : route)) : routes;
}

export const routes: Routes = buildRoutes(environment.demoMode);
