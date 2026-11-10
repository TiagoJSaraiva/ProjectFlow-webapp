import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { Project } from '../projects/project.model';
import { ProjectSyncService, ProjectSyncUpdate } from '../projects/project-sync.service';
import { ProjectService } from '../projects/project.service';
import { getApiErrorMessage } from '../shared/api-error';

type DateInput = string | number | number[] | Date | LocalDateTimeLike | null | undefined;

interface LocalDateTimeLike {
  year?: number;
  monthValue?: number;
  month?: number;
  dayOfMonth?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  nano?: number;
}

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [],
  templateUrl: './landing-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './landing-page.component.css'
})
export class LandingPageComponent implements OnInit, OnDestroy {
  projects: Project[] = [];
  isLoading = false;
  isCreating = false;
  errorMessage = '';
  private projectCounter = 1;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly projectService: ProjectService,
    private readonly router: Router,
    private readonly projectSync: ProjectSyncService
  ) {}

  ngOnInit(): void {
    this.subscribeToProjectSync();
    this.loadProjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
        this.applyProjectUpdates(this.projectSync.consumePending());
        if (shouldShowSpinner) {
          this.isLoading = false;
        }
      },
      error: (error: unknown) => {
        this.errorMessage = getApiErrorMessage(error, 'Não foi possível carregar os projetos. Tente novamente mais tarde.');
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
      error: (error: unknown) => {
        this.errorMessage = getApiErrorMessage(error, 'Não foi possível criar o projeto. Tente novamente.');
        this.isCreating = false;
      }
    });
  }

  openProject(project: Project): void {
    this.router.navigate(['/projects', project.id, 'board']);
  }

  formatDate(date?: DateInput): string {
    const parsedDate = this.parseDateInput(date);
    if (!parsedDate) {
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

    const resolvedCreated = this.parseDateInput(project?.dataCriado) ?? new Date(nowIso);
    const resolvedUpdated = this.parseDateInput(project?.ultimaAlteracao) ?? new Date(nowIso);
    const resolvedLastAccess = this.parseDateInput(project?.ultimoAcesso) ?? resolvedUpdated;

    return {
      id: project?.id ?? this.generateTempId(),
      nome: project?.nome ?? fallbackName,
      descricao: project?.descricao ?? '',
      dataCriado: resolvedCreated.toISOString(),
      ultimaAlteracao: resolvedUpdated.toISOString(),
      ultimoAcesso: resolvedLastAccess.toISOString(),
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

  private parseDateInput(value: DateInput): Date | null {
    if (value == null) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
      const dateFromNumber = new Date(value);
      return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
    }

    if (typeof value === 'string') {
      const normalized = value.includes('T') ? value : value.replace(' ', 'T');
      const withTimezone = this.ensureTimezone(normalized);
      const parsed = new Date(withTimezone);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (Array.isArray(value)) {
      return this.parseArrayDate(value);
    }

    const candidate = value as LocalDateTimeLike;
    const year = this.ensureNumber(candidate.year);
    const month = this.ensureNumber(candidate.monthValue ?? candidate.month);
    const day = this.ensureNumber(candidate.dayOfMonth ?? candidate.day);

    if (year === undefined || month === undefined || day === undefined) {
      return null;
    }

    const hour = this.ensureNumber(candidate.hour) ?? 0;
    const minute = this.ensureNumber(candidate.minute) ?? 0;
    const second = this.ensureNumber(candidate.second) ?? 0;
    const nano = this.ensureNumber(candidate.nano) ?? 0;
    const millis = Math.floor(nano / 1_000_000);

    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millis);
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private ensureTimezone(value: string): string {
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
    return hasTimezone ? value : `${value}Z`;
  }

  private ensureNumber(value?: number): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private parseArrayDate(parts: number[]): Date | null {
    const [year, month, day, hour = 0, minute = 0, second = 0, nano = 0] = parts;

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const millis = Math.floor((Number.isFinite(nano) ? nano : 0) / 1_000_000);
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millis);
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private subscribeToProjectSync(): void {
    this.projectSync
      .updates()
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => {
        const applied = this.applyProjectUpdates([update]);
        if (applied) {
          this.projectSync.markAsProcessed(update.id);
        }
      });
  }

  private applyProjectUpdates(updates: ProjectSyncUpdate[]): boolean {
    if (!updates.length || !this.projects.length) {
      return false;
    }

    const updateMap = new Map(updates.map((update) => [update.id, update]));
    let mutated = false;
    const nextProjects = this.projects.map((project) => {
      const candidate = updateMap.get(project.id);
      if (!candidate) {
        return project;
      }
      mutated = true;
      return this.mergeProjectUpdate(project, candidate);
    });

    if (!mutated) {
      return false;
    }

    this.projects = this.sortProjects(nextProjects);
    return true;
  }

  private mergeProjectUpdate(project: Project, update: ProjectSyncUpdate): Project {
    return {
      ...project,
      nome: update.nome ?? project.nome,
      descricao: update.descricao ?? project.descricao,
      dataCriado: update.dataCriado ?? project.dataCriado,
      ultimaAlteracao: update.ultimaAlteracao ?? project.ultimaAlteracao,
      ultimoAcesso: update.ultimoAcesso ?? project.ultimoAcesso,
      totalTarefas: typeof update.totalTarefas === 'number' ? update.totalTarefas : project.totalTarefas
    };
  }
}
