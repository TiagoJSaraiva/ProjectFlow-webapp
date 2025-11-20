import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../shared/auth/auth.service';
import { CreateProjectPayload, Project } from './project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly baseUrl = 'http://localhost:8080/api/projects';

  constructor(private readonly http: HttpClient, private readonly authService: AuthService) {}

  listByCurrentUser(): Observable<Project[]> {
    const session = this.authService.currentSession();
    if (!session) {
      throw new Error('Usuário não autenticado');
    }
    return this.http.get<Project[]>(`${this.baseUrl}/user/${session.userId}`).pipe(
      map((projects) =>
        projects.sort(
          (a, b) => new Date(b.dataCriado).getTime() - new Date(a.dataCriado).getTime()
        )
      )
    );
  }

  createProjectWithName(name: string): Observable<Project> {
    const session = this.authService.currentSession();
    if (!session) {
      throw new Error('Usuário não autenticado');
    }

    const payload: CreateProjectPayload = {
      nome: name,
      descricao: ''
    };

    return this.http.post<Project>(`${this.baseUrl}/user/${session.userId}`, payload);
  }
}
