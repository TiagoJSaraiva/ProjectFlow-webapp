import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../shared/api-config';
import { ProjectDiagramResponse, SaveProjectDiagramPayload } from './project-board.model';

@Injectable({ providedIn: 'root' })
export class ProjectBoardService {
	private readonly baseUrl = `${inject(API_BASE_URL)}/api/projects`;

	constructor(private readonly http: HttpClient) {}

	loadDiagram(projectId: string): Observable<ProjectDiagramResponse> {
		return this.http.get<ProjectDiagramResponse>(`${this.baseUrl}/${projectId}/diagram`);
	}

	saveDiagram(projectId: string, payload: SaveProjectDiagramPayload): Observable<ProjectDiagramResponse> {
		return this.http.put<ProjectDiagramResponse>(`${this.baseUrl}/${projectId}/diagram`, payload);
	}

	deleteProject(projectId: string): Observable<void> {
		return this.http.delete<void>(`${this.baseUrl}/${projectId}`);
	}
}
