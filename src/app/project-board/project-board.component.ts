import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	Component,
	ElementRef,
	HostListener,
	Injector,
	OnDestroy,
	OnInit,
	ViewChild,
	computed,
	effect,
	inject,
	signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Konva from 'konva';
import { Subject, takeUntil } from 'rxjs';
import { DiagramConnection, DiagramNode, DiagramNodeType, DiagramPoint, DiagramViewport, ProjectBoardState, ProjectDiagramResponse, SaveProjectDiagramPayload } from './project-board.model';
import { ProjectBoardService } from './project-board.service';

const DEFAULT_RECT = { width: 200, height: 120 };
const DEFAULT_RADIUS = 64;
const NODE_NAME_MAX_LENGTH = 35;

@Component({
	selector: 'app-project-board',
	standalone: true,
	imports: [CommonModule, FormsModule],
	templateUrl: './project-board.component.html',
	styleUrl: './project-board.component.css'
})
export class ProjectBoardComponent implements OnInit, AfterViewInit, OnDestroy {
	@ViewChild('stageContainer', { static: true })
	stageContainer?: ElementRef<HTMLDivElement>;

	readonly state = signal<ProjectBoardState>({
		projectId: '',
		projectName: '',
		projectDescription: '',
		viewport: { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
		nodes: [],
		connections: [],
		selectedNodeId: null,
		sidebarMode: 'catalog',
		linkSourceId: null,
		isDirty: false,
		isSaving: false,
		isDeleting: false,
		isLoading: true,
		statusMessage: null
	});

	readonly nodes = computed(() => this.state().nodes);
	readonly connections = computed(() => this.state().connections);
	readonly viewport = computed(() => this.state().viewport);
	readonly selectedNode = computed(() => this.state().nodes.find((n) => n.id === this.state().selectedNodeId) ?? null);
	readonly effectiveSidebarMode = computed(() => (this.state().selectedNodeId ? 'node' : this.state().sidebarMode));
	readonly selectedConnections = computed(() => {
		const selected = this.state().selectedNodeId;
		if (!selected) {
			return [];
		}
		return this.state().connections.filter((conn) => conn.fromNodeId === selected || conn.toNodeId === selected);
	});
	readonly linkModeActive = computed(() => Boolean(this.state().linkSourceId));
	private readonly injector = inject(Injector);
	private readonly viewportEffect = effect(
		() => {
			const state = this.state();
			const viewport = state.viewport;
			if (!this.stage) {
				return;
			}
			try {
				this.renderViewport(viewport);
			} catch (error) {
				console.error('[ProjectBoard] Failed to render viewport', { viewport, error });
			}
		},
		{ injector: this.injector }
	);
	private readonly diagramEffect = effect(
		() => {
			const state = this.state();
			console.debug('[ProjectBoard] diagram effect tick', {
				stageReady: Boolean(this.stage),
				nodeCount: state.nodes.length
			});
			if (!this.stage) {
				return;
			}
			const nodes = state.nodes;
			const connections = state.connections;
			const selectedId = state.selectedNodeId;
			const linkSourceId = state.linkSourceId;
			try {
				this.renderNodes(nodes, selectedId, linkSourceId);
				this.renderConnections(nodes, connections);
			} catch (error) {
				console.error('[ProjectBoard] Diagram render failed', {
					nodeCount: nodes.length,
					connectionCount: connections.length,
					error
				});
			}
		},
		{ injector: this.injector }
	);

	private destroy$ = new Subject<void>();
	private stage?: Konva.Stage;
	private gridLayer?: Konva.Layer;
	private connectionLayer?: Konva.Layer;
	private nodeLayer?: Konva.Layer;
	private gridGroup?: Konva.Group;
	private connectionGroup?: Konva.Group;
	private nodeGroup?: Konva.Group;
	private panSurface?: Konva.Rect;
	private isPanning = false;
	private panStart: { x: number; y: number } | null = null;
	private viewportStart: DiagramViewport | null = null;
	private paletteDragType: DiagramNodeType | null = null;
	private resizeObserver?: ResizeObserver;
	private currentGridSize: number | null = null;

	constructor(
		private readonly route: ActivatedRoute,
		private readonly router: Router,
		private readonly boardService: ProjectBoardService
	) {}

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
		this.initStage();
		console.debug('[ProjectBoard] Stage initialized', {
			container: this.stageContainer?.nativeElement,
			stageSize: { width: this.stage?.width(), height: this.stage?.height() }
		});
		this.safeRenderAll();
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
		this.resizeObserver?.disconnect();
		this.stage?.destroy();
	}

	trackByNode(_: number, node: DiagramNode): string {
		return node.id;
	}

	trackByConnection(_: number, connection: DiagramConnection): string {
		return connection.id;
	}

	setSidebarMode(mode: 'catalog' | 'project'): void {
		this.updateState({ sidebarMode: mode, selectedNodeId: mode === 'project' ? null : this.state().selectedNodeId });
	}

	selectNode(nodeId: string): void {
		this.updateState({ selectedNodeId: nodeId });
	}

	clearSelection(): void {
		this.updateState({ selectedNodeId: null, linkSourceId: null, sidebarMode: 'catalog' });
	}

	onPaletteDragStart(event: DragEvent, type: DiagramNodeType): void {
		this.paletteDragType = type;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'copy';
			event.dataTransfer.setData('application/x-projectflow-node', type);
			event.dataTransfer.setData('text/plain', type);
		}
	}

	onCanvasDragOver(event: DragEvent): void {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	onCanvasDrop(event: DragEvent): void {
		event.preventDefault();
		const type = (event.dataTransfer?.getData('application/x-projectflow-node') as DiagramNodeType) ?? this.paletteDragType;
		if (!type) {
			return;
		}
		const position = this.clientToWorld(event.clientX, event.clientY);
		this.addNode(type, position);
		this.paletteDragType = null;
	}

	@HostListener('document:dragover', ['$event'])
	handleDocumentDragOver(event: DragEvent): void {
		if (!this.isPointerInsideStage(event.clientX, event.clientY) || !this.isProjectflowDrag(event)) {
			return;
		}
		this.onCanvasDragOver(event);
	}

	@HostListener('document:drop', ['$event'])
	handleDocumentDrop(event: DragEvent): void {
		if (!this.isPointerInsideStage(event.clientX, event.clientY) || !this.isProjectflowDrag(event)) {
			return;
		}
		this.onCanvasDrop(event);
	}

	private isPointerInsideStage(clientX: number, clientY: number): boolean {
		const container = this.stageContainer?.nativeElement;
		if (!container) {
			return false;
		}
		const bounds = container.getBoundingClientRect();
		return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
	}

	private isProjectflowDrag(event: DragEvent): boolean {
		const typeList = event.dataTransfer?.types;
		if (!typeList) {
			return Boolean(this.paletteDragType);
		}
		if (Array.isArray(typeList)) {
			return typeList.includes('application/x-projectflow-node');
		}
		const domList = typeList as unknown as DOMStringList;
		if (typeof domList.contains === 'function') {
			return domList.contains('application/x-projectflow-node');
		}
		for (let index = 0; index < domList.length; index += 1) {
			const value = domList.item ? domList.item(index) : (domList as unknown as Record<number, string | undefined>)[index];
			if (value === 'application/x-projectflow-node') {
				return true;
			}
		}
		return Boolean(this.paletteDragType);
	}

	startLinkWorkflow(nodeId: string): void {
		this.updateState({ linkSourceId: nodeId });
	}

	cancelLinkWorkflow(): void {
		this.updateState({ linkSourceId: null });
	}

	deleteNode(nodeId: string): void {
		this.state.update((current) => ({
			...current,
			nodes: current.nodes.filter((node) => node.id !== nodeId),
			connections: current.connections.filter((conn) => conn.fromNodeId !== nodeId && conn.toNodeId !== nodeId),
			selectedNodeId: current.selectedNodeId === nodeId ? null : current.selectedNodeId,
			linkSourceId: current.linkSourceId === nodeId ? null : current.linkSourceId,
			isDirty: true
		}));
	}

	deleteConnection(connectionId: string): void {
		this.state.update((current) => ({
			...current,
			connections: current.connections.filter((conn) => conn.id !== connectionId),
			isDirty: true
		}));
	}

	resolveNodeLabel(nodeId: string): string {
		const node = this.state().nodes.find((candidate) => candidate.id === nodeId);
		return node?.name ?? 'Sample text';
	}

	isErrorStatus(): boolean {
		const normalized = this.state().statusMessage?.toLowerCase();
		return Boolean(normalized && normalized.includes('não'));
	}

	updateNodeField(field: keyof DiagramNode, value: string | number): void {
		const selected = this.state().selectedNodeId;
		if (!selected) {
			return;
		}
		const normalizedValue =
			typeof value === 'number'
				? value
				: field === 'name'
					? this.truncateNodeName(value)
					: value;
		this.state.update((current) => ({
			...current,
			nodes: current.nodes.map((node) => {
				if (node.id !== selected) {
					return node;
				}
				return { ...node, [field]: normalizedValue } as DiagramNode;
			}),
			isDirty: true
		}));
	}

	onProjectNameChange(value: string): void {
		this.updateState({ projectName: value.slice(0, 100), isDirty: true });
	}

	onProjectDescriptionChange(value: string): void {
		this.updateState({ projectDescription: value.slice(0, 10000), isDirty: true });
	}

	onSave(afterSave?: () => void): void {
		if (!this.state().projectId || this.state().isSaving) {
			return;
		}
		this.updateState({ isSaving: true, statusMessage: 'Salvando alterações...' });
		const payload = this.buildPayload();
		this.boardService
			.saveDiagram(this.state().projectId, payload)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => {
					this.hydrateState(response, true, 'Diagrama salvo com sucesso.');
					afterSave?.();
				},
				error: () => this.updateState({ isSaving: false, statusMessage: 'Não foi possível salvar o projeto. Tente novamente.' })
			});
	}

	goBack(): void {
		if (!this.state().isDirty) {
			this.router.navigateByUrl('/');
			return;
		}
		const confirmLeave = window.confirm('Tem certeza que deseja sair sem salvar?');
		if (confirmLeave) {
			this.router.navigateByUrl('/');
		}
	}

	deleteProject(): void {
		const projectId = this.state().projectId;
		if (!projectId || this.state().isDeleting) {
			return;
		}
		const confirmed = window.confirm('Tem certeza que deseja apagar este projeto? Esta ação não pode ser desfeita.');
		if (!confirmed) {
			return;
		}
		this.updateState({ isDeleting: true, statusMessage: 'Apagando projeto...' });
		this.boardService
			.deleteProject(projectId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: () => this.router.navigateByUrl('/'),
				error: () => this.updateState({ isDeleting: false, statusMessage: 'Não foi possível apagar o projeto.' })
			});
	}

	private loadDiagram(projectId: string): void {
		this.updateState({ isLoading: true, projectId });
		this.boardService
			.loadDiagram(projectId)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (response) => this.hydrateState(response, true, null),
				error: () => this.updateState({ isLoading: false, statusMessage: 'Não foi possível carregar o projeto.' })
			});
	}

	private hydrateState(response: ProjectDiagramResponse, markClean: boolean, statusMessage: string | null): void {
		const sanitizedNodes = (response.nodes ?? []).map((node) => ({
			...node,
			name: this.truncateNodeName(node.name ?? 'Sample text')
		}));
		this.state.set({
			projectId: response.projectId,
			projectName: response.projectName ?? 'Projeto sem nome',
			projectDescription: response.projectDescription ?? '',
			viewport: response.viewport ?? { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 },
			nodes: sanitizedNodes,
			connections: response.connections ?? [],
			selectedNodeId: null,
			sidebarMode: 'catalog',
			linkSourceId: null,
			isDirty: markClean ? false : this.state().isDirty,
			isSaving: false,
			isDeleting: false,
			isLoading: false,
			statusMessage
		});
	}

	private updateState(patch: Partial<ProjectBoardState>): void {
		this.state.update((current) => ({ ...current, ...patch }));
	}

	private initStage(): void {
		const container = this.stageContainer?.nativeElement;
		if (!container) {
			return;
		}

		this.stage = new Konva.Stage({
			container,
			width: container.clientWidth,
			height: container.clientHeight
		});

		this.gridLayer = new Konva.Layer();
		this.connectionLayer = new Konva.Layer();
		this.nodeLayer = new Konva.Layer();

		this.gridGroup = new Konva.Group();
		this.connectionGroup = new Konva.Group();
		this.nodeGroup = new Konva.Group();

		this.gridLayer.add(this.gridGroup);
		this.connectionLayer.add(this.connectionGroup);
		this.nodeLayer.add(this.nodeGroup);

		this.stage.add(this.gridLayer, this.connectionLayer, this.nodeLayer);

		this.panSurface = new Konva.Rect({
			width: this.stage.width(),
			height: this.stage.height(),
			fill: '#0c0c0f',
			listening: true
		});
		this.gridLayer.add(this.panSurface);
		this.panSurface.moveToBottom();

		this.stage.on('mousedown touchstart', (evt) => this.onPointerDown(evt));
		this.stage.on('mouseup touchend mouseleave', () => this.finishPan());
		this.stage.on('mousemove touchmove', () => this.onPointerMove());
		this.stage.on('wheel', (evt) => this.onWheel(evt));

		this.stage.on('click tap', (evt) => {
			if (evt.target === this.stage || evt.target === this.panSurface) {
				this.clearSelection();
			}
		});

		this.resizeObserver = new ResizeObserver(() => this.onResize());
		this.resizeObserver.observe(container);

		this.renderViewport(this.viewport());
	}

	private onResize(): void {
		if (!this.stage || !this.stageContainer) {
			return;
		}
		const width = this.stageContainer.nativeElement.clientWidth;
		const height = this.stageContainer.nativeElement.clientHeight;
		this.stage.size({ width, height });
		this.panSurface?.size({ width, height });
		this.gridLayer?.batchDraw();
	}

	private onPointerDown(evt: Konva.KonvaEventObject<DragEvent>): void {
		if (!this.stage || !this.panSurface) {
			return;
		}

		const target = evt.target;
		const isBackground = target === this.stage || target === this.panSurface;
		if (!isBackground) {
			return;
		}

		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}

		this.isPanning = true;
		this.panStart = pointer;
		this.viewportStart = { ...this.state().viewport };
	}

	private onPointerMove(): void {
		if (!this.isPanning || !this.stage || !this.panStart || !this.viewportStart) {
			return;
		}

		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}

		const dx = pointer.x - this.panStart.x;
		const dy = pointer.y - this.panStart.y;
		const newViewport: DiagramViewport = {
			...this.viewportStart,
			offsetX: this.viewportStart.offsetX + dx,
			offsetY: this.viewportStart.offsetY + dy
		};
		this.updateViewport(newViewport);
	}

	private finishPan(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.panStart = null;
			this.viewportStart = null;
			this.markDirty();
		}
	}

	private onWheel(evt: Konva.KonvaEventObject<WheelEvent>): void {
		if (!this.stage) {
			return;
		}
		evt.evt.preventDefault();
		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}
		const scaleBy = 1.05;
		const viewport = this.state().viewport;
		const oldScale = viewport.zoom;
		const mousePointTo = {
			x: (pointer.x - viewport.offsetX) / oldScale,
			y: (pointer.y - viewport.offsetY) / oldScale
		};
		const direction = evt.evt.deltaY > 0 ? -1 : 1;
		const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
		const newViewport: DiagramViewport = {
			...viewport,
			zoom: Math.min(Math.max(newScale, 0.2), 2.5),
			offsetX: pointer.x - mousePointTo.x * Math.min(Math.max(newScale, 0.2), 2.5),
			offsetY: pointer.y - mousePointTo.y * Math.min(Math.max(newScale, 0.2), 2.5)
		};
		this.updateViewport(newViewport);
		this.markDirty();
	}

	private updateViewport(viewport: DiagramViewport): void {
		this.updateState({ viewport });
	}

	private markDirty(): void {
		if (!this.state().isDirty) {
			this.updateState({ isDirty: true });
		}
	}

	private renderViewport(viewport: DiagramViewport): void {
		if (!this.gridGroup || !this.connectionGroup || !this.nodeGroup) {
			return;
		}
		[this.gridGroup, this.connectionGroup, this.nodeGroup].forEach((group) => {
			group.position({ x: viewport.offsetX, y: viewport.offsetY });
			group.scale({ x: viewport.zoom, y: viewport.zoom });
		});
		console.debug('[ProjectBoard] Viewport applied', viewport);
		this.drawGrid(viewport.gridSize);
	}

	private renderNodes(nodes: DiagramNode[], selectedId: string | null, linkSourceId: string | null): void {
		if (!this.nodeGroup) {
			return;
		}
		console.debug('[ProjectBoard] Rendering nodes', {
			count: nodes.length,
			viewport: this.state().viewport,
			groupScale: this.nodeGroup.scale(),
			groupPosition: this.nodeGroup.position()
		});
		this.nodeGroup.destroyChildren();
		for (const node of nodes) {
			console.debug('[ProjectBoard] Rendering node', node);
			const group = new Konva.Group({
				x: node.x,
				y: node.y,
				draggable: true,
				listening: true,
				id: node.id
			});

			group.on('dragend', () => this.persistNodePosition(node.id, group));
			group.on('click tap', (evt) => {
				evt.cancelBubble = true;
				if (linkSourceId && linkSourceId !== node.id) {
					this.completeConnection(node.id);
					return;
				}
				this.selectNode(node.id);
			});

			const palette = this.resolvePalette(node);
			if (node.type === 'RECTANGLE') {
				const width = node.width ?? DEFAULT_RECT.width;
				const height = node.height ?? DEFAULT_RECT.height;
				const rect = new Konva.Rect({
					width,
					height,
					cornerRadius: 24,
					fill: palette.fill,
					stroke: selectedId === node.id ? palette.activeStroke : palette.stroke,
					strokeWidth: 2,
					offsetX: width / 2,
					offsetY: height / 2
				});
				group.add(rect);
			} else {
				const radius = node.radius ?? DEFAULT_RADIUS;
				const circle = new Konva.Circle({
					radius,
					fill: palette.fill,
					stroke: selectedId === node.id ? palette.activeStroke : palette.stroke,
					strokeWidth: 2
				});
				group.add(circle);
			}

			const textWidth = node.type === 'RECTANGLE' ? node.width ?? DEFAULT_RECT.width : (node.radius ?? DEFAULT_RADIUS) * 2;
			const textHeight = node.type === 'RECTANGLE' ? node.height ?? DEFAULT_RECT.height : (node.radius ?? DEFAULT_RADIUS) * 2;
			const label = new Konva.Text({
				text: node.name || 'Sample text',
				fontFamily: 'Space Grotesk, Inter, sans-serif',
				fontSize: 18,
				fontStyle: '600',
				fill: palette.text,
				width: textWidth,
				height: textHeight,
				align: 'center',
				verticalAlign: 'middle',
				offsetX: textWidth / 2,
				offsetY: textHeight / 2,
				listening: false
			});
			group.add(label);

			this.nodeGroup.add(group);
		}
		this.nodeLayer?.batchDraw();
		console.debug('[ProjectBoard] node layer children', this.nodeGroup.getChildren().length);
	}

	private renderConnections(nodes: DiagramNode[], connections: DiagramConnection[]): void {
		if (!this.connectionGroup) {
			return;
		}
		this.connectionGroup.destroyChildren();
		const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

		for (const connection of connections) {
			const from = nodesById.get(connection.fromNodeId);
			const to = nodesById.get(connection.toNodeId);
			if (!from || !to) {
				continue;
			}
			const bend = connection.bendPoint ?? this.computeBendPoint(from, to);
			const line = new Konva.Line({
				points: [from.x, from.y, bend.x, bend.y, to.x, to.y],
				stroke: '#f7d046',
				strokeWidth: 3,
				lineCap: 'round',
				lineJoin: 'round'
			});
			this.connectionGroup.add(line);
		}
		this.connectionLayer?.batchDraw();
	}

	private drawGrid(gridSize: number): void {
		if (!this.gridGroup) {
			return;
		}
		if (this.currentGridSize === gridSize && this.gridGroup.getChildren().length) {
			this.gridLayer?.batchDraw();
			return;
		}
		this.currentGridSize = gridSize;
		this.gridGroup.destroyChildren();
		const range = 5000;
		for (let x = -range; x <= range; x += gridSize) {
			const line = new Konva.Line({
				points: [x, -range, x, range],
				stroke: x === 0 ? '#464646' : '#1f1f1f',
				strokeWidth: x === 0 ? 1.6 : 0.6
			});
			this.gridGroup.add(line);
		}
		for (let y = -range; y <= range; y += gridSize) {
			const line = new Konva.Line({
				points: [-range, y, range, y],
				stroke: y === 0 ? '#464646' : '#1f1f1f',
				strokeWidth: y === 0 ? 1.6 : 0.6
			});
			this.gridGroup.add(line);
		}
		this.gridLayer?.batchDraw();
	}

	private safeRenderAll(): void {
		try {
			this.renderViewport(this.viewport());
			this.renderNodes(this.nodes(), this.state().selectedNodeId, this.state().linkSourceId);
			this.renderConnections(this.nodes(), this.connections());
		} catch (error) {
			console.error('[ProjectBoard] Initial render failed', error);
		}
	}

	private addNode(type: DiagramNodeType, position: DiagramPoint): void {
		console.debug('[ProjectBoard] Adding node from drag/drop', { type, position });
		const newNode: DiagramNode = {
			id: this.generateId(),
			type,
			name: this.truncateNodeName('Sample text'),
			description: '',
			x: position.x,
			y: position.y,
			width: type === 'RECTANGLE' ? DEFAULT_RECT.width : undefined,
			height: type === 'RECTANGLE' ? DEFAULT_RECT.height : undefined,
			radius: type === 'CIRCLE' ? DEFAULT_RADIUS : undefined,
			rotation: 0,
			text: { value: 'Sample text' },
			metadata: { palette: type }
		};
		this.state.update((current) => ({
			...current,
			nodes: [...current.nodes, newNode],
			selectedNodeId: newNode.id,
			sidebarMode: 'node',
			isDirty: true
		}));
	}

	private persistNodePosition(nodeId: string, group: Konva.Group): void {
		this.state.update((current) => ({
			...current,
			nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, x: group.x(), y: group.y() } : node)),
			isDirty: true
		}));
	}

	private completeConnection(targetNodeId: string): void {
		const sourceId = this.state().linkSourceId;
		if (!sourceId || sourceId === targetNodeId) {
			return;
		}
		const nodes = this.state().nodes;
		const source = nodes.find((n) => n.id === sourceId);
		const target = nodes.find((n) => n.id === targetNodeId);
		if (!source || !target) {
			return;
		}
		const bendPoint = this.computeBendPoint(source, target);
		const connection: DiagramConnection = {
			id: this.generateId(),
			fromNodeId: sourceId,
			toNodeId: targetNodeId,
			bendPoint,
			style: { stroke: '#f7d046' }
		};
		this.state.update((current) => ({
			...current,
			connections: [...current.connections, connection],
			linkSourceId: null,
			isDirty: true
		}));
	}

	private computeBendPoint(source: DiagramNode, target: DiagramNode): DiagramPoint {
		const horizontalFirst = Math.abs(target.x - source.x) > Math.abs(target.y - source.y);
		if (horizontalFirst) {
			return { x: target.x, y: source.y };
		}
		return { x: source.x, y: target.y };
	}

	private buildPayload(): SaveProjectDiagramPayload {
		return {
			project: {
				name: this.state().projectName,
				description: this.state().projectDescription
			},
			viewport: this.state().viewport,
			nodes: this.state().nodes,
			connections: this.state().connections
		};
	}

	private truncateNodeName(value: string): string {
		return (value ?? '').slice(0, NODE_NAME_MAX_LENGTH);
	}

	private resolvePalette(node: DiagramNode): { fill: string; stroke: string; activeStroke: string; text: string } {
		return {
			fill: '#0f1115',
			stroke: '#393b46',
			activeStroke: '#f7d046',
			text: '#f3f3f3'
		};
	}

	private clientToWorld(clientX: number, clientY: number): DiagramPoint {
		const container = this.stageContainer?.nativeElement;
		const viewport = this.state().viewport;
		if (!container) {
			return { x: 0, y: 0 };
		}
		const bounds = container.getBoundingClientRect();
		const relativeX = clientX - bounds.left;
		const relativeY = clientY - bounds.top;
		const worldX = (relativeX - viewport.offsetX) / viewport.zoom;
		const worldY = (relativeY - viewport.offsetY) / viewport.zoom;
		return { x: worldX, y: worldY };
	}

	private generateId(): string {
		const globalCrypto = globalThis.crypto;
		if (globalCrypto?.randomUUID) {
			return globalCrypto.randomUUID();
		}
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}
}
