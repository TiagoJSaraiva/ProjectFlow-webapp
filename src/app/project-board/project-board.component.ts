import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	Injector,
	OnDestroy,
	OnInit,
	ViewChild,
	effect,
	inject,
	signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ProjectRepository } from '../data/project-repository';
import { getApiErrorMessage } from '../shared/api-error';
import { DialogAction, DialogComponent } from '../shared/dialog.component';
import { dataUrlToBlob, downloadBlob } from '../shared/download';
import { BoardToolbarComponent } from './board-toolbar.component';
import { nodesBounds } from './connection-geometry';
import { NODE_NAME_MAX_LENGTH } from './diagram-constants';
import { MAX_IMPORT_BYTES, exportFileBaseName, parseDiagramJson, serializeDiagram } from './diagram-io';
import { DiagramRenderer } from './diagram-renderer';
import { DiagramStore } from './diagram-store';
import { DiagramNode, DiagramNodeType } from './project-board.model';
import { fitViewport, zoomViewportAt } from './viewport-math';

type UnsavedDialogChoice = 'save' | 'discard' | 'cancel';

const PALETTE_MIME = 'application/x-projectflow-node';

/** Atalhos de teclado exibidos na ajuda (tecla + descrição). */
const SHORTCUTS: { keys: string; description: string }[] = [
	{ keys: 'Ctrl+S', description: 'Salvar o projeto' },
	{ keys: 'Ctrl+Z', description: 'Desfazer' },
	{ keys: 'Ctrl+Y ou Ctrl+Shift+Z', description: 'Refazer' },
	{ keys: '[ e ]', description: 'Selecionar o elemento anterior / seguinte' },
	{ keys: 'Setas', description: 'Mover o elemento selecionado (Shift move mais)' },
	{ keys: 'Delete ou Backspace', description: 'Excluir o elemento selecionado' },
	{ keys: 'Enter', description: 'Editar o título do elemento selecionado (ou concluir a conexão)' },
	{ keys: 'C', description: 'Criar conexão a partir do elemento selecionado' },
	{ keys: 'Esc', description: 'Cancelar a ação atual / limpar a seleção' }
];

@Component({
	selector: 'app-project-board',
	standalone: true,
	imports: [FormsModule, DialogComponent, BoardToolbarComponent],
	providers: [DiagramStore],
	templateUrl: './project-board.component.html',
	changeDetection: ChangeDetectionStrategy.Eager,
	styleUrl: './project-board.component.css'
})
export class ProjectBoardComponent implements OnInit, AfterViewInit, OnDestroy {
	@ViewChild('stageContainer', { static: true })
	stageContainer?: ElementRef<HTMLDivElement>;

	private readonly store = inject(DiagramStore);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly repository = inject(ProjectRepository);
	private readonly injector = inject(Injector);

	readonly state = this.store.state;
	readonly selectedNode = this.store.selectedNode;
	readonly effectiveSidebarMode = this.store.effectiveSidebarMode;
	readonly selectedConnections = this.store.selectedConnections;
	readonly linkModeActive = this.store.linkModeActive;
	readonly nodes = this.store.nodes;
	readonly canUndo = this.store.canUndo;
	readonly canRedo = this.store.canRedo;
	readonly nodeNameMaxLength = NODE_NAME_MAX_LENGTH;
	readonly shortcuts = SHORTCUTS;

	readonly deleteDialogOpen = signal(false);
	readonly unsavedDialogOpen = signal(false);
	readonly reloadDialogOpen = signal(false);
	readonly shortcutsOpen = signal(false);
	/** Mensagem de falha ao carregar o projeto (mostra painel com "Tentar novamente"). */
	readonly loadError = signal<string | null>(null);

	private renderer?: DiagramRenderer;
	private readonly destroy$ = new Subject<void>();
	private paletteDragType: DiagramNodeType | null = null;
	private unsavedDialogResolver: ((choice: UnsavedDialogChoice) => void) | null = null;
	private readonly supportsNativeBeforeUnload = typeof window !== 'undefined' && 'onbeforeunload' in window;
	private unloadIntent: 'reload' | 'close' | null = null;
	private fallbackAction: 'reload' | 'close' | null = null;
	private allowExternalUnload = false;

	private readonly viewportEffect = effect(
		() => {
			const viewport = this.store.viewport();
			this.safely('viewport', () => this.renderer?.setViewport(viewport));
		},
		{ injector: this.injector }
	);

	private readonly diagramEffect = effect(
		() => {
			const state = this.store.state();
			this.safely('diagram', () => this.renderDiagram(state.nodes, state.connections, state.selectedNodeId));
		},
		{ injector: this.injector }
	);

	ngOnInit(): void {
		this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
			const projectId = params.get('id');
			if (!projectId) {
				this.router.navigateByUrl('/');
				return;
			}
			this.loadDiagram(projectId);
		});
	}

	ngAfterViewInit(): void {
		const container = this.stageContainer?.nativeElement;
		if (!container) {
			return;
		}
		this.renderer = new DiagramRenderer(container, {
			getViewport: () => this.store.viewport(),
			nodeClick: (id) => this.onNodeClick(id),
			nodeDragMove: (id, x, y) => this.previewConnectionsWhileDragging(id, x, y),
			nodeDragEnd: (id, x, y) => this.store.moveNode(id, x, y),
			nodeResize: (id, size) => this.previewResize(id, size),
			nodeResizeEnd: (id, size) => this.store.resizeNode(id, size),
			backgroundClick: () => this.store.clearSelection(),
			viewportChange: (viewport) => this.store.setViewport(viewport),
			viewportCommit: () => this.store.markDirty()
		});
		this.safely('initial', () => {
			this.renderer?.setViewport(this.store.viewport());
			this.renderDiagram(this.store.nodes(), this.store.connections(), this.store.state().selectedNodeId);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.renderer?.destroy();
	}

	// --- Sidebar / seleção ---------------------------------------------------------------

	setSidebarMode(mode: 'catalog' | 'project'): void {
		this.store.setSidebarMode(mode);
	}

	clearSelection(): void {
		this.store.clearSelection();
	}

	startLinkWorkflow(nodeId: string): void {
		this.store.startLink(nodeId);
	}

	cancelLinkWorkflow(): void {
		this.store.cancelLink();
	}

	deleteNode(nodeId: string): void {
		this.store.deleteNode(nodeId);
	}

	deleteConnection(connectionId: string): void {
		this.store.deleteConnection(connectionId);
	}

	resolveNodeLabel(nodeId: string): string {
		return this.store.resolveNodeLabel(nodeId);
	}

	isErrorStatus(): boolean {
		return this.store.isErrorStatus();
	}

	updateNodeField(field: keyof DiagramNode, value: string | number): void {
		this.store.updateSelectedNodeField(field, value);
	}

	onProjectNameChange(value: string): void {
		this.store.setProjectName(value);
	}

	onProjectDescriptionChange(value: string): void {
		this.store.setProjectDescription(value);
	}

	trackByConnection(_: number, connection: { id: string }): string {
		return connection.id;
	}

	// --- Arrastar da paleta para o canvas -------------------------------------------------

	onPaletteDragStart(event: DragEvent, type: DiagramNodeType): void {
		this.paletteDragType = type;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'copy';
			event.dataTransfer.setData(PALETTE_MIME, type);
			event.dataTransfer.setData('text/plain', type);
		}
	}

	@HostListener('document:dragover', ['$event'])
	handleDocumentDragOver(event: DragEvent): void {
		if (!this.renderer?.isInside(event.clientX, event.clientY) || !this.isPaletteDrag(event)) {
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	@HostListener('document:drop', ['$event'])
	handleDocumentDrop(event: DragEvent): void {
		if (!this.renderer?.isInside(event.clientX, event.clientY) || !this.isPaletteDrag(event)) {
			return;
		}
		event.preventDefault();
		const type = (event.dataTransfer?.getData(PALETTE_MIME) as DiagramNodeType) || this.paletteDragType;
		if (!type) {
			return;
		}
		this.store.addNode(type, this.renderer.clientToWorld(event.clientX, event.clientY));
		this.paletteDragType = null;
	}

	private isPaletteDrag(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		if (!types) {
			return Boolean(this.paletteDragType);
		}
		return Array.from(types as ArrayLike<string>).includes(PALETTE_MIME) || Boolean(this.paletteDragType);
	}

	// --- Histórico, zoom e ajuda ------------------------------------------------------------

	undo(): void {
		this.store.undo();
	}

	redo(): void {
		this.store.redo();
	}

	zoomPercent(): number {
		return Math.round(this.store.viewport().zoom * 100);
	}

	zoomBy(factor: number): void {
		const size = this.renderer?.viewSize();
		if (!size) {
			return;
		}
		const viewport = this.store.viewport();
		this.store.setViewport(zoomViewportAt(viewport, { x: size.width / 2, y: size.height / 2 }, viewport.zoom * factor));
		this.store.markDirty();
	}

	fitToContent(): void {
		const size = this.renderer?.viewSize();
		const bounds = nodesBounds(this.store.nodes());
		if (!size || !bounds) {
			return;
		}
		this.store.setViewport(fitViewport(bounds, size, this.store.viewport()));
		this.store.markDirty();
	}

	/** Adiciona um nó no centro da área visível (alternativa ao arrastar: teclado e toque). */
	addNodeAtCenter(type: DiagramNodeType): void {
		const size = this.renderer?.viewSize();
		if (!size) {
			return;
		}
		const viewport = this.store.viewport();
		const jitter = (this.store.nodes().length % 5) * 24;
		this.store.addNode(type, {
			x: (size.width / 2 - viewport.offsetX) / viewport.zoom + jitter,
			y: (size.height / 2 - viewport.offsetY) / viewport.zoom + jitter
		});
	}

	// --- Exportar / importar ---------------------------------------------------------------

	exportJson(): void {
		const state = this.store.state();
		const json = serializeDiagram({
			projectName: state.projectName,
			projectDescription: state.projectDescription,
			viewport: state.viewport,
			nodes: state.nodes,
			connections: state.connections
		});
		downloadBlob(`${exportFileBaseName(state.projectName)}.json`, new Blob([json], { type: 'application/json' }));
		this.store.flash('Diagrama exportado em JSON.');
	}

	exportPng(): void {
		const state = this.store.state();
		const dataUrl = this.renderer?.exportPng(state.nodes, state.connections);
		if (!dataUrl) {
			this.store.flash('Não há elementos para exportar.', true);
			return;
		}
		downloadBlob(`${exportFileBaseName(state.projectName)}.png`, dataUrlToBlob(dataUrl));
		this.store.flash('Imagem PNG exportada.');
	}

	async importJson(file: File): Promise<void> {
		if (file.size > MAX_IMPORT_BYTES) {
			this.store.flash('Arquivo grande demais para importar (máximo 1 MB).', true);
			return;
		}
		const result = parseDiagramJson(await file.text());
		if (!result.ok) {
			this.store.flash(`Não foi possível importar: ${result.error}`, true);
			return;
		}
		this.store.replaceDiagram(result.diagram);
		this.store.flash('Diagrama importado. Salve para manter as alterações.');
	}

	selectNodeById(nodeId: string): void {
		this.store.selectNode(nodeId);
	}

	// --- Persistência --------------------------------------------------------------------

	onSave(afterSave?: () => void, onError?: () => void): void {
		const state = this.store.state();
		if (!state.projectId || state.isSaving) {
			return;
		}
		const invalidNode = this.store.findInvalidNodeName();
		if (invalidNode) {
			this.store.setStatus(
				`O nome do nó "${invalidNode.name.slice(0, 20)}..." excede o limite de ${NODE_NAME_MAX_LENGTH} caracteres.`,
				true
			);
			onError?.();
			return;
		}
		this.store.setStatus('Salvando alterações...', false, { isSaving: true });
		const payload = this.store.buildPayload();
		this.repository
			.saveDiagram(state.projectId, payload)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					// Só confirma o sucesso quando o servidor devolve o que foi enviado.
					const confirmed =
						response?.projectId === this.store.state().projectId &&
						(response.projectName ?? '') === payload.project.name &&
						(response.projectDescription ?? '') === payload.project.description;
					if (!confirmed) {
						// Mantém as edições locais; nada é dado como salvo.
						this.store.setStatus('O servidor não confirmou o nome/descrição do projeto. Tente salvar novamente.', true, {
							isSaving: false,
							isDirty: true
						});
						onError?.();
						return;
					}
					this.store.hydrate(response, true, 'Diagrama salvo com sucesso.');
					afterSave?.();
				},
				error: (error: unknown) => {
					this.store.setStatus(getApiErrorMessage(error, 'Não foi possível salvar o projeto. Tente novamente.'), true, { isSaving: false });
					onError?.();
				}
			});
	}

	retryLoad(): void {
		const projectId = this.store.state().projectId;
		if (projectId) {
			this.loadDiagram(projectId);
		}
	}

	private loadDiagram(projectId: string): void {
		this.loadError.set(null);
		this.store.patch({ isLoading: true, projectId });
		this.repository
			.loadDiagram(projectId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => this.store.hydrate(response, true, null),
				error: (error: unknown) => {
					const message = getApiErrorMessage(error, 'Não foi possível carregar o projeto.');
					this.loadError.set(message);
					this.store.setStatus(message, true, { isLoading: false });
				}
			});
	}

	deleteProject(): void {
		const state = this.store.state();
		if (!state.projectId || state.isDeleting) {
			return;
		}
		this.deleteDialogOpen.set(true);
	}

	confirmDeleteProject(): void {
		const state = this.store.state();
		if (!state.projectId || state.isDeleting) {
			return;
		}
		this.deleteDialogOpen.set(false);
		this.store.setStatus('Apagando projeto...', false, { isDeleting: true });
		this.repository
			.delete(state.projectId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: () => {
					// Projeto apagado: não há mais o que salvar, então a saída não deve pedir confirmação.
					this.store.patch({ isDirty: false, isDeleting: false });
					this.router.navigateByUrl('/');
				},
				error: (error: unknown) =>
					this.store.setStatus(getApiErrorMessage(error, 'Não foi possível apagar o projeto.'), true, { isDeleting: false })
			});
	}

	cancelDeleteProject(): void {
		this.deleteDialogOpen.set(false);
	}

	// --- Saída com alterações pendentes ---------------------------------------------------

	goBack(): void {
		if (!this.store.state().isDirty) {
			this.router.navigateByUrl('/');
			return;
		}
		this.promptUnsavedDialog().then((choice) => this.handleUnsavedChoice(choice, () => this.router.navigateByUrl('/')));
	}

	requestUnsavedExitPermission(): Promise<boolean> {
		if (!this.store.state().isDirty) {
			return Promise.resolve(true);
		}
		return new Promise<boolean>((resolve) => {
			this.promptUnsavedDialog().then((choice) => {
				if (choice === 'cancel') {
					resolve(false);
				} else if (choice === 'save') {
					this.onSave(
						() => resolve(true),
						() => resolve(false)
					);
				} else {
					resolve(true);
				}
			});
		});
	}

	onUnsavedDialogAction(choice: UnsavedDialogChoice): void {
		this.unsavedDialogResolver?.(choice);
	}

	confirmReload(): void {
		this.reloadDialogOpen.set(false);
		if (!this.store.state().isDirty) {
			window.location.reload();
			return;
		}
		if (this.fallbackAction === 'reload') {
			this.executeFallbackAction('reload');
		}
		this.fallbackAction = null;
	}

	cancelReloadDialog(): void {
		this.reloadDialogOpen.set(false);
		if (this.fallbackAction === 'reload') {
			this.fallbackAction = null;
		}
		this.unloadIntent = null;
	}

	@HostListener('window:keydown', ['$event'])
	handleWindowKeydown(event: KeyboardEvent): void {
		if (this.store.state().isDirty) {
			const isReloadShortcut = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r');
			if (isReloadShortcut) {
				this.unloadIntent = 'reload';
			}
		}
		this.handleEditorShortcut(event);
	}

	private handleEditorShortcut(event: KeyboardEvent): void {
		if (this.deleteDialogOpen() || this.unsavedDialogOpen() || this.reloadDialogOpen() || this.shortcutsOpen()) {
			return; // os diálogos tratam o próprio teclado
		}
		const key = event.key.toLowerCase();
		const mod = event.ctrlKey || event.metaKey;
		const target = event.target instanceof HTMLElement ? event.target : null;
		const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));

		if (mod && key === 's') {
			event.preventDefault();
			if (this.store.state().isDirty) {
				this.onSave();
			}
			return;
		}
		if (mod && key === 'z' && !event.shiftKey) {
			if (!typing) {
				event.preventDefault();
				this.undo();
			}
			return;
		}
		if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
			if (!typing) {
				event.preventDefault();
				this.redo();
			}
			return;
		}
		if (typing || mod || event.altKey) {
			if (key === 'escape' && typing) {
				target?.blur();
			}
			return;
		}

		const selected = this.store.selectedNode();
		switch (event.key) {
			case 'Escape':
				if (this.store.linkModeActive()) {
					this.store.cancelLink();
				} else {
					this.store.clearSelection();
				}
				return;
			case 'Delete':
			case 'Backspace':
				if (selected) {
					event.preventDefault();
					this.store.deleteNode(selected.id);
				}
				return;
			case 'ArrowLeft':
			case 'ArrowRight':
			case 'ArrowUp':
			case 'ArrowDown': {
				if (!selected) {
					return;
				}
				event.preventDefault();
				const step = event.shiftKey ? 50 : 10;
				const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
				const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
				this.store.moveSelectedBy(dx, dy);
				return;
			}
			case '[':
			case ']':
				this.store.selectAdjacent(event.key === ']' ? 1 : -1);
				return;
			case 'Enter':
				if (selected && this.store.linkModeActive()) {
					this.store.completeConnection(selected.id);
				} else if (selected && !target?.closest('button, a')) {
					document.getElementById('node-title-input')?.focus();
				}
				return;
			case 'c':
			case 'C':
				if (selected) {
					this.store.startLink(selected.id);
				}
				return;
		}
	}

	@HostListener('window:beforeunload', ['$event'])
	handleBeforeUnload(event: BeforeUnloadEvent): void {
		if (!this.store.state().isDirty || this.allowExternalUnload) {
			this.unloadIntent = null;
			return;
		}
		const intent = this.unloadIntent ?? 'close';
		event.preventDefault();
		if (this.supportsNativeBeforeUnload) {
			event.returnValue = '';
			this.unloadIntent = null;
			this.fallbackAction = null;
			return;
		}
		this.fallbackAction = intent;
		if (intent === 'reload') {
			this.reloadDialogOpen.set(true);
		} else {
			this.showFallbackUnsavedExitDialog();
		}
		this.unloadIntent = null;
	}

	private handleUnsavedChoice(choice: UnsavedDialogChoice, continueCallback: () => void): void {
		if (choice === 'cancel') {
			return;
		}
		if (choice === 'save') {
			this.onSave(continueCallback);
			return;
		}
		continueCallback();
	}

	private promptUnsavedDialog(): Promise<UnsavedDialogChoice> {
		this.unsavedDialogResolver?.('cancel');
		this.unsavedDialogOpen.set(true);
		return new Promise((resolve) => {
			this.unsavedDialogResolver = (choice) => {
				this.unsavedDialogOpen.set(false);
				this.unsavedDialogResolver = null;
				resolve(choice);
			};
		});
	}

	private showFallbackUnsavedExitDialog(): void {
		this.promptUnsavedDialog().then((choice) => {
			if (choice === 'cancel') {
				this.fallbackAction = null;
				this.unloadIntent = null;
				return;
			}
			this.handleUnsavedChoice(choice, () => this.executeFallbackAction('close'));
		});
	}

	private executeFallbackAction(action: 'reload' | 'close'): void {
		this.allowExternalUnload = true;
		this.fallbackAction = null;
		this.unloadIntent = null;
		if (action === 'reload') {
			window.location.reload();
			return;
		}
		window.close();
		setTimeout(() => (this.allowExternalUnload = false), 0);
	}

	// --- Diálogos (definição das ações) ----------------------------------------------------

	readonly deleteActions = (): DialogAction[] => [
		{ value: 'yes', label: 'Sim', kind: 'danger', disabled: this.store.state().isDeleting },
		{ value: 'no', label: 'Não', kind: 'secondary' }
	];
	readonly closeActions: DialogAction[] = [{ value: 'close', label: 'Fechar', kind: 'primary' }];
	readonly reloadActions: DialogAction[] = [
		{ value: 'reload', label: 'Recarregar', kind: 'primary' },
		{ value: 'cancel', label: 'Cancelar', kind: 'secondary' }
	];
	readonly unsavedActions = (): DialogAction[] => {
		const saving = this.store.state().isSaving;
		return [
			{ value: 'save', label: saving ? 'Salvando...' : 'Salvar e sair', kind: 'primary', disabled: saving },
			{ value: 'discard', label: 'Sair sem salvar', kind: 'danger', disabled: saving },
			{ value: 'cancel', label: 'Cancelar', kind: 'secondary', disabled: saving }
		];
	};

	// --- Interação com o canvas ------------------------------------------------------------

	private onNodeClick(nodeId: string): void {
		const linkSource = this.store.state().linkSourceId;
		if (linkSource && linkSource !== nodeId) {
			this.store.completeConnection(nodeId);
			return;
		}
		this.store.selectNode(nodeId);
	}

	/** Redesenha as conexões do nó enquanto ele é arrastado, sem alterar o estado. */
	private previewConnectionsWhileDragging(nodeId: string, x: number, y: number): void {
		const nodes = this.store.nodes().map((node) => (node.id === nodeId ? { ...node, x, y } : node));
		this.renderer?.renderConnections(nodes, this.store.connections());
	}

	/** Redesenha as conexões com o tamanho provisório do nó durante o redimensionamento. */
	private previewResize(nodeId: string, size: { width?: number; height?: number; radius?: number }): void {
		const nodes = this.store.nodes().map((node) => (node.id === nodeId ? { ...node, ...size } : node));
		this.renderer?.renderConnections(nodes, this.store.connections());
	}

	private renderDiagram(nodes: DiagramNode[], connections: ReturnType<DiagramStore['connections']>, selectedId: string | null): void {
		this.renderer?.renderNodes(nodes, selectedId);
		this.renderer?.renderConnections(nodes, connections);
	}

	private safely(label: string, action: () => void): void {
		try {
			action();
		} catch (error) {
			console.error(`[ProjectBoard] Render failed (${label})`, error);
		}
	}
}
