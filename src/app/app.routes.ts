import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { authGuard } from './shared/auth/auth.guard';

export const routes: Routes = [
	{
		path: 'login',
		component: LoginComponent
	},
	{
		path: '',
		component: LandingPageComponent,
		canActivate: [authGuard]
	},
	{
		path: '**',
		redirectTo: ''
	}
];
