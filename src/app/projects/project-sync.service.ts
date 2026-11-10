import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface ProjectSyncUpdate {
	id: string;
	nome?: string;
	descricao?: string | null;
	dataCriado?: string;
	ultimaAlteracao?: string;
	ultimoAcesso?: string;
	totalTarefas?: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectSyncService {
	private readonly updatesSubject = new Subject<ProjectSyncUpdate>();
	private pending = new Map<string, ProjectSyncUpdate>();

	emit(update: ProjectSyncUpdate): void {
		if (!update.id) {
			return;
		}
		const merged = { ...this.pending.get(update.id), ...update };
		this.pending.set(update.id, merged);
		this.updatesSubject.next(merged);
	}

	updates(): Observable<ProjectSyncUpdate> {
		return this.updatesSubject.asObservable();
	}

	consumePending(): ProjectSyncUpdate[] {
		if (!this.pending.size) {
			return [];
		}
		const items = Array.from(this.pending.values());
		this.pending.clear();
		return items;
	}

	markAsProcessed(projectId: string): void {
		this.pending.delete(projectId);
	}
}
