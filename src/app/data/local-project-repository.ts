import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, defer, of } from 'rxjs';
import { ProjectDiagramResponse, SaveProjectDiagramPayload } from '../project-board/project-board.model';
import { Project } from '../projects/project.model';
import { DemoDatabase, createDemoDatabase } from './demo-seed';
import { ProjectRepository } from './project-repository';

export const DEMO_STORAGE_KEY = 'projectflow_demo_v1';
export const NODE_NAME_LIMIT = 35;

/** Subconjunto de `Storage` usado pelo repositório local (facilita testes). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key)
  };
}

export const DEMO_STORAGE = new InjectionToken<KeyValueStorage>('DEMO_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      const storage = globalThis.localStorage;
      storage.setItem('__projectflow_probe__', '1');
      storage.removeItem('__projectflow_probe__');
      return storage;
    } catch {
      return createMemoryStorage(); // armazenamento bloqueado: a demo funciona, mas sem persistir
    }
  }
});

function apiError(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: message, error: { message } });
}

const DEFAULT_VIEWPORT = { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 };

/**
 * Repositório do modo demonstração. Persiste tudo em um único documento JSON no `localStorage`:
 * o volume é pequeno (alguns projetos com dezenas de nós, poucos KB cada), a API é síncrona e
 * simples de testar, e dispensa o esquema/versões do IndexedDB. Ao exceder a cota, o salvamento
 * falha com mensagem clara em vez de perder dados silenciosamente.
 */
@Injectable({ providedIn: 'root' })
export class LocalProjectRepository extends ProjectRepository {
  private readonly storage = inject(DEMO_STORAGE);

  list(): Observable<Project[]> {
    return defer(() => {
      const db = this.read();
      return of(db.projects.map((project) => ({ ...project, totalTarefas: db.diagrams[project.id]?.nodes.length ?? 0 })));
    });
  }

  create(name: string): Observable<Project> {
    return defer(() => {
      const db = this.read();
      const now = new Date().toISOString();
      const id = this.newId();
      const project: Project = {
        id,
        nome: name,
        descricao: '',
        dataCriado: now,
        ultimaAlteracao: now,
        ultimoAcesso: now,
        usuarioId: 'demo',
        usuarioNome: 'Demonstração',
        totalTarefas: 0
      };
      db.projects.push(project);
      db.diagrams[id] = {
        projectId: id,
        projectName: name,
        projectDescription: '',
        viewport: { ...DEFAULT_VIEWPORT },
        nodes: [],
        connections: []
      };
      this.write(db);
      return of(project);
    });
  }

  loadDiagram(projectId: string): Observable<ProjectDiagramResponse> {
    return defer(() => {
      const db = this.read();
      const project = db.projects.find((candidate) => candidate.id === projectId);
      const diagram = db.diagrams[projectId];
      if (!project || !diagram) {
        throw apiError(404, 'Projeto não encontrado.');
      }
      project.ultimoAcesso = new Date().toISOString();
      this.write(db);
      return of(this.toResponse(project, diagram));
    });
  }

  saveDiagram(projectId: string, payload: SaveProjectDiagramPayload): Observable<ProjectDiagramResponse> {
    return defer(() => {
      const db = this.read();
      const project = db.projects.find((candidate) => candidate.id === projectId);
      if (!project) {
        throw apiError(404, 'Projeto não encontrado.');
      }
      const tooLong = payload.nodes.find((node) => (node.name ?? '').length > NODE_NAME_LIMIT);
      if (tooLong) {
        throw apiError(422, `O nome do nó não pode ultrapassar ${NODE_NAME_LIMIT} caracteres.`);
      }
      if (!payload.project.name.trim()) {
        throw apiError(400, 'O nome do projeto é obrigatório.');
      }
      const now = new Date().toISOString();
      project.nome = payload.project.name;
      project.descricao = payload.project.description;
      project.ultimaAlteracao = now;
      project.ultimoAcesso = now;
      project.totalTarefas = payload.nodes.length;
      db.diagrams[projectId] = {
        projectId,
        projectName: payload.project.name,
        projectDescription: payload.project.description,
        viewport: payload.viewport,
        nodes: payload.nodes,
        connections: payload.connections
      };
      this.write(db);
      return of(this.toResponse(project, db.diagrams[projectId]));
    });
  }

  delete(projectId: string): Observable<void> {
    return defer(() => {
      const db = this.read();
      if (!db.projects.some((project) => project.id === projectId)) {
        throw apiError(404, 'Projeto não encontrado.');
      }
      db.projects = db.projects.filter((project) => project.id !== projectId);
      delete db.diagrams[projectId];
      this.write(db);
      return of(undefined);
    });
  }

  /** Descarta todos os dados locais e recria os projetos de exemplo. */
  restoreSamples(): void {
    this.write(createDemoDatabase());
  }

  private toResponse(project: Project, diagram: ProjectDiagramResponse): ProjectDiagramResponse {
    return structuredClone({ ...diagram, projectName: project.nome, projectDescription: project.descricao ?? '' });
  }

  /** Lê o banco; na primeira visita (ou com dados corrompidos) cria os exemplos. */
  private read(): DemoDatabase {
    const raw = this.storage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoDatabase;
        if (parsed?.version === 1 && Array.isArray(parsed.projects) && parsed.diagrams) {
          return parsed;
        }
      } catch {
        // dados corrompidos: recomeça com os exemplos
      }
    }
    const seeded = createDemoDatabase();
    this.write(seeded);
    return seeded;
  }

  private write(db: DemoDatabase): void {
    try {
      this.storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
    } catch {
      throw apiError(507, 'Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).');
    }
  }

  private newId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
