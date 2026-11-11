import { Provider, inject } from '@angular/core';
import { DEMO_MODE } from '../shared/api-config';
import { HttpProjectRepository } from './http-project-repository';
import { LocalProjectRepository } from './local-project-repository';
import { ProjectRepository } from './project-repository';

/** Seleciona a implementação do repositório conforme `environment.demoMode`. */
export function provideProjectRepository(): Provider {
  return {
    provide: ProjectRepository,
    useFactory: () => (inject(DEMO_MODE) ? inject(LocalProjectRepository) : inject(HttpProjectRepository))
  };
}
