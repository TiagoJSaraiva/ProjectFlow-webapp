export type DiagramNodeType = 'CIRCLE' | 'RECTANGLE';

export interface DiagramViewport {
	zoom: number;
	offsetX: number;
	offsetY: number;
	gridSize: number;
}

export interface DiagramPoint {
	x: number;
	y: number;
}

export interface DiagramNode {
	id: string;
	type: DiagramNodeType;
	name: string;
	description: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
	radius?: number;
	rotation: number;
	text?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface DiagramConnection {
	id: string;
	fromNodeId: string;
	toNodeId: string;
	bendPoint?: DiagramPoint;
	style?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface ProjectDiagramResponse {
	projectId: string;
	projectName: string;
	projectDescription: string;
	viewport: DiagramViewport;
	nodes: DiagramNode[];
	connections: DiagramConnection[];
}

export interface SaveProjectDiagramPayload {
	project: {
		name: string;
		description: string;
	};
	viewport: DiagramViewport;
	nodes: DiagramNode[];
	connections: DiagramConnection[];
}

export interface ProjectBoardState {
	projectId: string;
	projectName: string;
	projectDescription: string;
	viewport: DiagramViewport;
	nodes: DiagramNode[];
	connections: DiagramConnection[];
	selectedNodeId: string | null;
	sidebarOpen: boolean;
	sidebarMode: 'catalog' | 'project' | 'node';
	linkSourceId: string | null;
	isDirty: boolean;
	isSaving: boolean;
	isLoading: boolean;
	statusMessage: string | null;
}
