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

  loadProjects(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.projectService.listByCurrentUser().subscribe({
      next: (projects) => {
        this.projects = projects.map((project) => ({
          ...project,
          totalTarefas: project.totalTarefas ?? 0
        }));
        this.projectCounter = this.computeNextProjectNumber(this.projects);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível carregar os projetos. Tente novamente mais tarde.';
        this.isLoading = false;
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
        const normalizedProject = {
          ...project,
          totalTarefas: project.totalTarefas ?? 0
        };
        this.projects = [normalizedProject, ...this.projects];
        this.projectCounter = this.computeNextProjectNumber(this.projects);
        this.isCreating = false;
      },
      error: () => {
        this.errorMessage = 'Não foi possível criar o projeto. Tente novamente.';
        this.isCreating = false;
      }
    });
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
  }

  trackByProject(_index: number, project: Project): string {
    return project.id;
  }

  private computeNextProjectNumber(projects: Project[]): number {
    const regex = /projeto\s+(\d+)/i;
    const numbers = projects
      .map((project) => {
        const match = project.nome.match(regex);
        return match ? Number(match[1]) : undefined;
      })
      .filter((value): value is number => Number.isFinite(value));

    if (!numbers.length) {
      return projects.length + 1;
    }

    return Math.max(...numbers) + 1;
  }
}
