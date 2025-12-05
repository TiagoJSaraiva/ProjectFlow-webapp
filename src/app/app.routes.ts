import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { RecoverComponent } from './auth/recover.component';
import { RegisterComponent } from './auth/register.component';
import { ResetPasswordComponent } from './auth/reset-password.component';
import { VerifyEmailComponent } from './auth/verify-email.component';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { authGuard } from './shared/auth/auth.guard';

export const routes: Routes = [
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
		canActivate: [authGuard]
	},
	{
		path: '**',
		redirectTo: ''
	}
];
