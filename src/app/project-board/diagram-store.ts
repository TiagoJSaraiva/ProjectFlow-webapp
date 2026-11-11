import { Injectable, computed, signal } from '@angular/core';
import { generateId } from '../shared/ids';
import { computeBendPoint, recomputeBendPoints } from './connection-geometry';
import { History } from './diagram-history';
import { DEFAULT_RADIUS, DEFAULT_RECT, DEFAULT_VIEWPORT, NODE_NAME_MAX_LENGTH, clampNodeSize } from './diagram-constants';
import {
	DiagramConnection,
	DiagramNode,
	DiagramNodeType,
	DiagramPoint,
	DiagramViewport,
	ProjectBoardState,
	ProjectDiagramResponse,
	SaveProjectDiagramPayload
} from './project-board.model';

export function truncateNodeName(value: string): string {
	return (value ?? '').slice(0, NODE_NAME_MAX_LENGTH);
}

function initialState(): ProjectBoardState {
	return {
		projectId: '',
		projectName: '',
		projectDescription: '',
		viewport: { ...DEFAULT_VIEWPORT },
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
	};
}

interface DiagramSnapshot {
	nodes: DiagramNode[];
	connections: DiagramConnection[];
}

/** Estado do diagrama aberto no board e as operações de edição sobre ele (sem Konva nem HTTP). */
@Injectable()
export class DiagramStore {
	readonly state = signal<ProjectBoardState>(initialState());
	private readonly statusError = signal(false);
	private readonly history = new History<DiagramSnapshot>();
	private readonly historyVersion = signal(0);
	readonly canUndo = computed(() => (this.historyVersion(), this.history.canUndo));
	readonly canRedo = computed(() => (this.historyVersion(), this.history.canRedo));

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
	readonly isErrorStatus = computed(() => this.statusError() && Boolean(this.state().statusMessage));

	/** Guarda o diagrama atual no histórico (chame ANTES de alterá-lo). */
	private record(key: string | null = null): void {
		const { nodes, connections } = this.state();
		this.history.record({ nodes, connections }, key);
		this.historyVersion.update((v) => v + 1);
	}

	/** Encerra o agrupamento de alterações (ex.: ao terminar de digitar ou soltar uma tecla). */
	breakHistoryGroup(): void {
		this.history.breakGroup();
	}

	undo(): void {
		this.restore(this.history.undo(this.currentSnapshot()));
	}

	redo(): void {
		this.restore(this.history.redo(this.currentSnapshot()));
	}

	private currentSnapshot(): DiagramSnapshot {
		const { nodes, connections } = this.state();
		return { nodes, connections };
	}

	private restore(snapshot: DiagramSnapshot | null): void {
		if (!snapshot) {
			return;
		}
		this.historyVersion.update((v) => v + 1);
		this.state.update((current) => ({
			...current,
			nodes: snapshot.nodes,
			connections: snapshot.connections,
			selectedNodeId: snapshot.nodes.some((n) => n.id === current.selectedNodeId) ? current.selectedNodeId : null,
			linkSourceId: snapshot.nodes.some((n) => n.id === current.linkSourceId) ? current.linkSourceId : null,
			isDirty: true
		}));
	}

	patch(patch: Partial<ProjectBoardState>): void {
		this.state.update((current) => ({ ...current, ...patch }));
	}

	/** Mensagem de status do header; `isError` pinta em vermelho. */
	setStatus(message: string | null, isError = false, extra: Partial<ProjectBoardState> = {}): void {
		this.statusError.set(isError);
		this.patch({ ...extra, statusMessage: message });
	}

	hydrate(response: ProjectDiagramResponse, markClean: boolean, statusMessage: string | null): void {
		this.statusError.set(false);
		this.history.clear();
		this.historyVersion.update((v) => v + 1);
		this.state.set({
			projectId: response.projectId,
			projectName: response.projectName ?? 'Projeto sem nome',
			projectDescription: response.projectDescription ?? '',
			viewport: response.viewport ?? { ...DEFAULT_VIEWPORT },
			nodes: (response.nodes ?? []).map((node) => ({ ...node, name: truncateNodeName(node.name ?? 'Sample text') })),
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

	buildPayload(): SaveProjectDiagramPayload {
		const state = this.state();
		return {
			project: { name: state.projectName, description: state.projectDescription },
			viewport: state.viewport,
			nodes: state.nodes,
			connections: state.connections
		};
	}

	findInvalidNodeName(): DiagramNode | undefined {
		return this.state().nodes.find((node) => (node.name ?? '').length > NODE_NAME_MAX_LENGTH);
	}

	setSidebarMode(mode: 'catalog' | 'project'): void {
		this.patch({ sidebarMode: mode, selectedNodeId: mode === 'project' ? null : this.state().selectedNodeId });
	}

	selectNode(nodeId: string): void {
		this.history.breakGroup();
		this.patch({ selectedNodeId: nodeId });
	}

	clearSelection(): void {
		this.history.breakGroup();
		this.patch({ selectedNodeId: null, linkSourceId: null, sidebarMode: 'catalog' });
	}

	startLink(nodeId: string): void {
		this.patch({ linkSourceId: nodeId });
	}

	cancelLink(): void {
		this.patch({ linkSourceId: null });
	}

	markDirty(): void {
		if (!this.state().isDirty) {
			this.patch({ isDirty: true });
		}
	}

	setViewport(viewport: DiagramViewport): void {
		this.patch({ viewport });
	}

	setProjectName(value: string): void {
		this.patch({ projectName: value.slice(0, 100), isDirty: true });
	}

	setProjectDescription(value: string): void {
		this.patch({ projectDescription: value.slice(0, 10000), isDirty: true });
	}

	addNode(type: DiagramNodeType, position: DiagramPoint): DiagramNode {
		this.record();
		const node: DiagramNode = {
			id: generateId(),
			type,
			name: truncateNodeName('Sample text'),
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
			nodes: [...current.nodes, node],
			selectedNodeId: node.id,
			sidebarMode: 'node',
			isDirty: true
		}));
		return node;
	}

	updateSelectedNodeField(field: keyof DiagramNode, value: string | number): void {
		const selected = this.state().selectedNodeId;
		if (!selected) {
			return;
		}
		let normalized: string | number = typeof value === 'number' ? value : field === 'name' ? truncateNodeName(value) : value;
		if (field === 'width' || field === 'height' || field === 'radius') {
			if (typeof normalized !== 'number' || !Number.isFinite(normalized)) {
				return;
			}
			normalized = clampNodeSize(field, normalized);
		}
		this.record(`field:${selected}:${field}`);
		this.state.update((current) => ({
			...current,
			nodes: current.nodes.map((node) => (node.id === selected ? ({ ...node, [field]: normalized } as DiagramNode) : node)),
			isDirty: true
		}));
	}

	/** Redimensiona o nó (largura/altura do retângulo ou raio do círculo), respeitando os limites. */
	resizeNode(nodeId: string, size: { width?: number; height?: number; radius?: number }): void {
		this.record();
		this.state.update((current) => ({
			...current,
			nodes: current.nodes.map((node) => {
				if (node.id !== nodeId) {
					return node;
				}
				return node.type === 'RECTANGLE'
					? {
							...node,
							width: clampNodeSize('width', size.width ?? node.width ?? DEFAULT_RECT.width),
							height: clampNodeSize('height', size.height ?? node.height ?? DEFAULT_RECT.height)
						}
					: { ...node, radius: clampNodeSize('radius', size.radius ?? node.radius ?? DEFAULT_RADIUS) };
			}),
			isDirty: true
		}));
	}

	/** Move o nó e recalcula o ponto de dobra das conexões ligadas a ele. */
	moveNode(nodeId: string, x: number, y: number, groupKey: string | null = null): void {
		this.record(groupKey);
		this.state.update((current) => {
			const nodes = current.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node));
			return { ...current, nodes, connections: recomputeBendPoints(current.connections, nodes, nodeId), isDirty: true };
		});
	}

	deleteNode(nodeId: string): void {
		this.record();
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
		this.record();
		this.state.update((current) => ({
			...current,
			connections: current.connections.filter((conn) => conn.id !== connectionId),
			isDirty: true
		}));
	}

	/** Conclui a conexão iniciada em `linkSourceId` até o nó alvo. */
	completeConnection(targetNodeId: string): void {
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
		this.record();
		const connection: DiagramConnection = {
			id: generateId(),
			fromNodeId: sourceId,
			toNodeId: targetNodeId,
			bendPoint: computeBendPoint(source, target),
			style: { stroke: '#f7d046' }
		};
		this.state.update((current) => ({
			...current,
			connections: [...current.connections, connection],
			linkSourceId: null,
			isDirty: true
		}));
	}

	/** Move o nó selecionado `dx`/`dy` (atalhos de seta); movimentos seguidos formam um único passo. */
	moveSelectedBy(dx: number, dy: number): void {
		const node = this.selectedNode();
		if (node) {
			this.moveNode(node.id, node.x + dx, node.y + dy, `move:${node.id}`);
		}
	}

	/** Seleciona o nó seguinte/anterior na ordem de criação (navegação por teclado). */
	selectAdjacent(step: 1 | -1): void {
		const nodes = this.state().nodes;
		if (!nodes.length) {
			return;
		}
		const index = nodes.findIndex((n) => n.id === this.state().selectedNodeId);
		const next = index === -1 ? (step === 1 ? 0 : nodes.length - 1) : (index + step + nodes.length) % nodes.length;
		this.selectNode(nodes[next].id);
	}

	resolveNodeLabel(nodeId: string): string {
		return this.state().nodes.find((candidate) => candidate.id === nodeId)?.name ?? 'Sample text';
	}
}
