import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Project } from '../projects/project.model';
import { ProjectService } from '../projects/project.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing-page.component.html',
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit {
  projects: Project[] = [];
  isLoading = false;
  isCreating = false;
  errorMessage = '';
  private projectCounter = 1;

  constructor(private readonly projectService: ProjectService) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(options?: { silent?: boolean }): void {
    const shouldShowSpinner = !options?.silent;
    if (shouldShowSpinner) {
      this.isLoading = true;
    }
    this.errorMessage = '';

    this.projectService.listByCurrentUser().subscribe({
      next: (projects) => {
        const normalized = projects.map((project) => ({
          ...project,
          totalTarefas: project.totalTarefas ?? 0
        }));
        this.projects = this.sortProjects(normalized);
        this.projectCounter = this.computeNextProjectNumber(this.projects);
        if (shouldShowSpinner) {
          this.isLoading = false;
        }
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os projetos. Tente novamente mais tarde.';
        if (shouldShowSpinner) {
          this.isLoading = false;
        }
      }
    });
  }

  createProject(): void {
    if (this.isCreating) {
      return;
    }

    this.isCreating = true;
    const projectName = `Projeto ${this.projectCounter}`;

    this.projectService.createProjectWithName(projectName).subscribe({
      next: (project) => {
        const normalizedProject = this.normalizeProject(project, projectName);
        this.projects = this.sortProjects([normalizedProject, ...this.projects]);
        this.projectCounter = this.computeNextProjectNumber(this.projects);
        this.isCreating = false;
        this.loadProjects({ silent: true });
      },
      error: () => {
        this.errorMessage = 'Não foi possível criar o projeto. Tente novamente.';
        this.isCreating = false;
      }
    });
  }

  openProject(project: Project): void {
    console.log('Botão clicado', project);
  }

  formatDate(date?: string | null): string {
    if (!date) {
      return '—';
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return '—';
    }

    return new Intl.DateTimeFormat('pt-BR').format(parsedDate);
  }

  trackByProject(_index: number, project: Project): string {
    return project.id;
  }

  private computeNextProjectNumber(projects: Project[]): number {
    const numbers = projects
      .map((project) => this.extractProjectNumber(project.nome))
      .filter((value): value is number => Number.isFinite(value));

    if (!numbers.length) {
      return projects.length + 1;
    }

    return Math.max(...numbers) + 1;
  }

  private normalizeProject(project: Project | null | undefined, fallbackName: string): Project {
    const nowIso = new Date().toISOString();

    return {
      id: project?.id ?? this.generateTempId(),
      nome: project?.nome ?? fallbackName,
      descricao: project?.descricao ?? '',
      dataCriado: project?.dataCriado ?? nowIso,
      ultimaAlteracao: project?.ultimaAlteracao ?? nowIso,
      usuarioId: project?.usuarioId ?? '',
      usuarioNome: project?.usuarioNome ?? '',
      totalTarefas: project?.totalTarefas ?? 0
    };
  }

  private generateTempId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2);
  }

  private sortProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) => {
      const numberA = this.extractProjectNumber(a.nome);
      const numberB = this.extractProjectNumber(b.nome);

      if (numberA !== undefined && numberB !== undefined && numberA !== numberB) {
        return numberA - numberB;
      }

      if (numberA !== undefined) {
        return -1;
      }

      if (numberB !== undefined) {
        return 1;
      }

      return new Date(b.dataCriado).getTime() - new Date(a.dataCriado).getTime();
    });
  }

  private extractProjectNumber(name: string | null | undefined): number | undefined {
    if (!name) {
      return undefined;
    }

    const regex = /projeto\s+(\d+)/i;
    const match = name.match(regex);
    return match ? Number(match[1]) : undefined;
  }
}
