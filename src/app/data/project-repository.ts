import { Observable } from 'rxjs';
import { ProjectDiagramResponse, SaveProjectDiagramPayload } from '../project-board/project-board.model';
import { Project } from '../projects/project.model';

/**
 * Contrato de acesso a projetos e diagramas usado pelas telas.
 * Implementações: HTTP (servidor) e local (modo demonstração, dados no navegador).
 */
export abstract class ProjectRepository {
  abstract list(): Observable<Project[]>;
  abstract create(name: string): Observable<Project>;
  abstract loadDiagram(projectId: string): Observable<ProjectDiagramResponse>;
  abstract saveDiagram(projectId: string, payload: SaveProjectDiagramPayload): Observable<ProjectDiagramResponse>;
  abstract delete(projectId: string): Observable<void>;
}
