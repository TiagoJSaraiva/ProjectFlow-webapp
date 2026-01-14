import { CanDeactivateFn } from '@angular/router';
import { ProjectBoardComponent } from './project-board.component';

export const projectBoardPendingChangesGuard: CanDeactivateFn<ProjectBoardComponent> = (component) => {
	return component.requestUnsavedExitPermission();
};
