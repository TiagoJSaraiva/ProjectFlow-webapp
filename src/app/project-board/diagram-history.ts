/**
 * Histórico de desfazer/refazer baseado em snapshots imutáveis.
 * `record` guarda o estado ANTES de uma alteração; alterações consecutivas com a mesma `key`
 * (ex.: digitar o título, mover com as setas) são agrupadas em um único passo de desfazer.
 */
export class History<T> {
	private past: T[] = [];
	private future: T[] = [];
	private lastKey: string | null = null;

	constructor(private readonly limit = 100) {}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	record(before: T, key: string | null = null): void {
		if (key !== null && key === this.lastKey) {
			return; // continua o mesmo grupo de alterações
		}
		this.lastKey = key;
		this.past.push(before);
		if (this.past.length > this.limit) {
			this.past.shift();
		}
		this.future = [];
	}

	/** Encerra o agrupamento atual: a próxima alteração vira um novo passo. */
	breakGroup(): void {
		this.lastKey = null;
	}

	undo(current: T): T | null {
		const previous = this.past.pop();
		if (previous === undefined) {
			return null;
		}
		this.future.push(current);
		this.lastKey = null;
		return previous;
	}

	redo(current: T): T | null {
		const next = this.future.pop();
		if (next === undefined) {
			return null;
		}
		this.past.push(current);
		this.lastKey = null;
		return next;
	}

	clear(): void {
		this.past = [];
		this.future = [];
		this.lastKey = null;
	}
}
