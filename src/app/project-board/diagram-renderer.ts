import Konva from 'konva';
import { connectionPath, nodesBounds } from './connection-geometry';
import { DEFAULT_RADIUS, DEFAULT_RECT, clampNodeSize } from './diagram-constants';
import { DiagramConnection, DiagramNode, DiagramViewport } from './project-board.model';
import { zoomViewportAt } from './viewport-math';

export interface NodeSize {
	width?: number;
	height?: number;
	radius?: number;
}

/** Eventos que o renderizador devolve ao dono do estado. */
export interface RendererEvents {
	getViewport(): DiagramViewport;
	nodeClick(nodeId: string): void;
	nodeDragMove(nodeId: string, x: number, y: number): void;
	nodeDragEnd(nodeId: string, x: number, y: number): void;
	/** Redimensionamento em andamento (apenas pré-visualização). */
	nodeResize(nodeId: string, size: NodeSize): void;
	nodeResizeEnd(nodeId: string, size: NodeSize): void;
	backgroundClick(): void;
	/** Pan/zoom em andamento (atualiza o viewport). */
	viewportChange(viewport: DiagramViewport): void;
}

const PALETTE = { fill: '#0f1115', stroke: '#393b46', activeStroke: '#f7d046', text: '#f3f3f3' };

function addNodeShapes(group: Konva.Group, node: DiagramNode, selected: boolean): void {
	const stroke = selected ? PALETTE.activeStroke : PALETTE.stroke;
	if (node.type === 'RECTANGLE') {
		const width = node.width ?? DEFAULT_RECT.width;
		const height = node.height ?? DEFAULT_RECT.height;
		group.add(new Konva.Rect({ width, height, cornerRadius: 24, fill: PALETTE.fill, stroke, strokeWidth: 2, offsetX: width / 2, offsetY: height / 2 }));
	} else {
		group.add(new Konva.Circle({ radius: node.radius ?? DEFAULT_RADIUS, fill: PALETTE.fill, stroke, strokeWidth: 2 }));
	}

	const textWidth = node.type === 'RECTANGLE' ? (node.width ?? DEFAULT_RECT.width) : (node.radius ?? DEFAULT_RADIUS) * 2;
	const textHeight = node.type === 'RECTANGLE' ? (node.height ?? DEFAULT_RECT.height) : (node.radius ?? DEFAULT_RADIUS) * 2;
	group.add(
		new Konva.Text({
			text: node.name || 'Sample text',
			fontFamily: 'Space Grotesk, Inter, sans-serif',
			fontSize: 18,
			fontStyle: '600',
			fill: PALETTE.text,
			width: textWidth,
			height: textHeight,
			align: 'center',
			verticalAlign: 'middle',
			offsetX: textWidth / 2,
			offsetY: textHeight / 2,
			listening: false
		})
	);
}

function addConnectionArrows(target: Konva.Group, nodes: DiagramNode[], connections: DiagramConnection[]): void {
	const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
	for (const connection of connections) {
		const from = nodesById.get(connection.fromNodeId);
		const to = nodesById.get(connection.toNodeId);
		const path = from && to ? connectionPath(from, to) : null;
		if (!path) {
			continue;
		}
		target.add(
			new Konva.Arrow({
				points: path.flatMap((point) => [point.x, point.y]),
				stroke: '#f7d046',
				fill: '#f7d046',
				strokeWidth: 3,
				pointerLength: 14,
				pointerWidth: 14,
				lineCap: 'round',
				lineJoin: 'round'
			})
		);
	}
}

/** Desenha o diagrama com Konva (grade, conexões e nós) e traduz o ponteiro em eventos de alto nível. */
export class DiagramRenderer {
	private readonly stage: Konva.Stage;
	private readonly gridLayer = new Konva.Layer();
	private readonly connectionLayer = new Konva.Layer();
	private readonly nodeLayer = new Konva.Layer();
	private readonly gridGroup = new Konva.Group();
	private readonly connectionGroup = new Konva.Group();
	private readonly nodeGroup = new Konva.Group();
	private readonly panSurface: Konva.Rect;
	private readonly resizeObserver: ResizeObserver;
	private currentGridSize: number | null = null;
	private isPanning = false;
	private panStart: { x: number; y: number } | null = null;
	private viewportStart: DiagramViewport | null = null;
	private lastPinch: { distance: number; center: { x: number; y: number } } | null = null;

	constructor(
		private readonly container: HTMLDivElement,
		private readonly events: RendererEvents
	) {
		Konva.hitOnDragEnabled = true; // permite gestos de 2 dedos mesmo com um nó sendo arrastado
		this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
		this.gridLayer.add(this.gridGroup);
		this.connectionLayer.add(this.connectionGroup);
		this.nodeLayer.add(this.nodeGroup);
		this.stage.add(this.gridLayer, this.connectionLayer, this.nodeLayer);

		this.panSurface = new Konva.Rect({ width: this.stage.width(), height: this.stage.height(), fill: '#0c0c0f', listening: true });
		this.gridLayer.add(this.panSurface);
		this.panSurface.moveToBottom();

		this.stage.on('mousedown touchstart', (evt) => this.onPointerDown(evt.target));
		this.stage.on('mouseup touchend mouseleave', () => this.finishPan());
		this.stage.on('mousemove touchmove', (evt) => {
			if ('touches' in evt.evt && (evt.evt as TouchEvent).touches.length >= 2) {
				this.onPinch(evt.evt as TouchEvent);
				return;
			}
			this.onPointerMove();
		});
		this.stage.on('touchend touchcancel', (evt) => {
			if (this.lastPinch && (evt.evt as TouchEvent).touches.length < 2) {
				this.lastPinch = null;
			}
		});
		this.stage.on('wheel', (evt) => this.onWheel(evt));
		this.stage.on('click tap', (evt) => {
			if (this.isBackground(evt.target)) {
				this.events.backgroundClick();
			}
		});

		this.resizeObserver = new ResizeObserver(() => this.onResize());
		this.resizeObserver.observe(container);
	}

	destroy(): void {
		this.resizeObserver.disconnect();
		this.stage.destroy();
	}

	/** Converte coordenadas da janela para coordenadas do diagrama. */
	clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
		const bounds = this.container.getBoundingClientRect();
		const viewport = this.events.getViewport();
		return { x: (clientX - bounds.left - viewport.offsetX) / viewport.zoom, y: (clientY - bounds.top - viewport.offsetY) / viewport.zoom };
	}

	/** Tamanho visível do canvas em pixels. */
	viewSize(): { width: number; height: number } {
		return { width: this.container.clientWidth, height: this.container.clientHeight };
	}

	isInside(clientX: number, clientY: number): boolean {
		const bounds = this.container.getBoundingClientRect();
		return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
	}

	setViewport(viewport: DiagramViewport): void {
		[this.gridGroup, this.connectionGroup, this.nodeGroup].forEach((group) => {
			group.position({ x: viewport.offsetX, y: viewport.offsetY });
			group.scale({ x: viewport.zoom, y: viewport.zoom });
		});
		this.scaleHandles(viewport.zoom);
		this.drawGrid(viewport.gridSize);
	}

	renderNodes(nodes: DiagramNode[], selectedId: string | null): void {
		this.nodeGroup.destroyChildren();
		for (const node of nodes) {
			const group = new Konva.Group({ x: node.x, y: node.y, draggable: true, listening: true, id: node.id });
			// Eventos de arrasto da alça de redimensionamento sobem até o grupo: só o arrasto do próprio nó conta.
			group.on('dragmove', (evt) => evt.target === group && this.events.nodeDragMove(node.id, group.x(), group.y()));
			group.on('dragend', (evt) => evt.target === group && this.events.nodeDragEnd(node.id, group.x(), group.y()));
			group.on('click tap', (evt) => {
				evt.cancelBubble = true;
				this.events.nodeClick(node.id);
			});

			addNodeShapes(group, node, selectedId === node.id);
			if (selectedId === node.id) {
				group.add(this.createResizeHandle(node));
			}
			this.nodeGroup.add(group);
		}
		this.scaleHandles(this.events.getViewport().zoom);
		this.nodeLayer.batchDraw();
	}

	renderConnections(nodes: DiagramNode[], connections: DiagramConnection[]): void {
		this.connectionGroup.destroyChildren();
		addConnectionArrows(this.connectionGroup, nodes, connections);
		this.connectionLayer.batchDraw();
	}

	/**
	 * Exporta o diagrama inteiro (não só a área visível) como PNG em data URL, com fundo escuro.
	 * Devolve `null` quando não há nós.
	 */
	exportPng(nodes: DiagramNode[], connections: DiagramConnection[]): string | null {
		const bounds = nodesBounds(nodes);
		if (!bounds) {
			return null;
		}
		const padding = 40;
		const width = Math.ceil(bounds.maxX - bounds.minX + padding * 2);
		const height = Math.ceil(bounds.maxY - bounds.minY + padding * 2);
		const stage = new Konva.Stage({ container: document.createElement('div'), width, height });
		try {
			const layer = new Konva.Layer();
			stage.add(layer);
			layer.add(new Konva.Rect({ width, height, fill: '#0c0c0f' }));
			const content = new Konva.Group({ x: padding - bounds.minX, y: padding - bounds.minY });
			layer.add(content);
			addConnectionArrows(content, nodes, connections);
			for (const node of nodes) {
				const group = new Konva.Group({ x: node.x, y: node.y });
				addNodeShapes(group, node, false);
				content.add(group);
			}
			layer.draw();
			const pixelRatio = Math.min(2, 8000 / Math.max(width, height));
			return stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
		} finally {
			stage.destroy();
		}
	}

	/** Mantém as alças com tamanho constante na tela, independente do zoom. */
	private scaleHandles(zoom: number): void {
		for (const handle of this.nodeGroup.find('.resize-handle')) {
			handle.scale({ x: 1 / zoom, y: 1 / zoom });
		}
	}

	private createResizeHandle(node: DiagramNode): Konva.Rect {
		const isRect = node.type === 'RECTANGLE';
		const handle = new Konva.Rect({
			name: 'resize-handle',
			width: 18,
			height: 18,
			offsetX: 9,
			offsetY: 9,
			cornerRadius: 4,
			fill: '#f7d046',
			stroke: '#050505',
			strokeWidth: 1,
			x: isRect ? (node.width ?? DEFAULT_RECT.width) / 2 : (node.radius ?? DEFAULT_RADIUS),
			y: isRect ? (node.height ?? DEFAULT_RECT.height) / 2 : 0,
			draggable: true
		});
		// Evita que o clique/arrasto da alça também arraste ou selecione o nó.
		handle.on('mousedown touchstart click tap', (evt) => (evt.cancelBubble = true));
		handle.on('mouseenter', () => (this.container.style.cursor = 'nwse-resize'));
		handle.on('mouseleave', () => (this.container.style.cursor = ''));
		handle.on('dragmove', () => {
			const size = this.sizeFromHandle(node, handle);
			this.applySizePreview(handle.getParent() as Konva.Group, node, size);
			this.events.nodeResize(node.id, size);
		});
		handle.on('dragend', () => this.events.nodeResizeEnd(node.id, this.sizeFromHandle(node, handle)));
		return handle;
	}

	private sizeFromHandle(node: DiagramNode, handle: Konva.Rect): NodeSize {
		if (node.type === 'RECTANGLE') {
			return { width: clampNodeSize('width', handle.x() * 2), height: clampNodeSize('height', handle.y() * 2) };
		}
		return { radius: clampNodeSize('radius', handle.x()) };
	}

	/** Atualiza as formas do nó durante o arrasto da alça, sem passar pelo estado. */
	private applySizePreview(group: Konva.Group, node: DiagramNode, size: NodeSize): void {
		const handle = group.findOne('.resize-handle') as Konva.Rect;
		const shape = group.getChildren()[0];
		const label = group.findOne('Text') as Konva.Text;
		if (node.type === 'RECTANGLE' && size.width && size.height) {
			(shape as Konva.Rect).setAttrs({ width: size.width, height: size.height, offsetX: size.width / 2, offsetY: size.height / 2 });
			label.setAttrs({ width: size.width, height: size.height, offsetX: size.width / 2, offsetY: size.height / 2 });
			handle.position({ x: size.width / 2, y: size.height / 2 });
		} else if (node.type === 'CIRCLE' && size.radius) {
			(shape as Konva.Circle).radius(size.radius);
			label.setAttrs({ width: size.radius * 2, height: size.radius * 2, offsetX: size.radius, offsetY: size.radius });
			handle.position({ x: size.radius, y: 0 });
		}
	}

	private isBackground(target: Konva.Node): boolean {
		return target === this.stage || target === this.panSurface;
	}

	private drawGrid(gridSize: number): void {
		if (this.currentGridSize === gridSize && this.gridGroup.getChildren().length) {
			this.gridLayer.batchDraw();
			return;
		}
		this.currentGridSize = gridSize;
		this.gridGroup.destroyChildren();
		const range = 5000;
		for (let x = -range; x <= range; x += gridSize) {
			this.gridGroup.add(new Konva.Line({ points: [x, -range, x, range], stroke: x === 0 ? '#464646' : '#1f1f1f', strokeWidth: x === 0 ? 1.6 : 0.6 }));
		}
		for (let y = -range; y <= range; y += gridSize) {
			this.gridGroup.add(new Konva.Line({ points: [-range, y, range, y], stroke: y === 0 ? '#464646' : '#1f1f1f', strokeWidth: y === 0 ? 1.6 : 0.6 }));
		}
		this.gridLayer.batchDraw();
	}

	private onResize(): void {
		const width = this.container.clientWidth;
		const height = this.container.clientHeight;
		this.stage.size({ width, height });
		this.panSurface.size({ width, height });
		this.gridLayer.batchDraw();
	}

	private onPointerDown(target: Konva.Node): void {
		if (!this.isBackground(target)) {
			return;
		}
		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}
		this.isPanning = true;
		this.panStart = pointer;
		this.viewportStart = { ...this.events.getViewport() };
	}

	private onPointerMove(): void {
		if (!this.isPanning || !this.panStart || !this.viewportStart) {
			return;
		}
		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}
		this.events.viewportChange({
			...this.viewportStart,
			offsetX: this.viewportStart.offsetX + pointer.x - this.panStart.x,
			offsetY: this.viewportStart.offsetY + pointer.y - this.panStart.y
		});
	}

	private finishPan(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.panStart = null;
			this.viewportStart = null;
		}
	}

	/** Gesto de pinça: aproxima/afasta (zoom) e arrasta (pan) com dois dedos. */
	private onPinch(event: TouchEvent): void {
		event.preventDefault();
		// Dois dedos nunca arrastam um nó nem fazem pan de um dedo.
		Konva.DD.node?.stopDrag();
		this.isPanning = false;
		this.panStart = null;
		this.viewportStart = null;

		const bounds = this.container.getBoundingClientRect();
		const [a, b] = [event.touches[0], event.touches[1]];
		const center = { x: (a.clientX + b.clientX) / 2 - bounds.left, y: (a.clientY + b.clientY) / 2 - bounds.top };
		const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		if (this.lastPinch && this.lastPinch.distance > 0) {
			const viewport = this.events.getViewport();
			const zoomed = zoomViewportAt(viewport, this.lastPinch.center, viewport.zoom * (distance / this.lastPinch.distance));
			this.events.viewportChange({
				...zoomed,
				offsetX: zoomed.offsetX + (center.x - this.lastPinch.center.x),
				offsetY: zoomed.offsetY + (center.y - this.lastPinch.center.y)
			});
		}
		this.lastPinch = { distance, center };
	}

	private onWheel(evt: Konva.KonvaEventObject<WheelEvent>): void {
		evt.evt.preventDefault();
		const pointer = this.stage.getPointerPosition();
		if (!pointer) {
			return;
		}
		const scaleBy = 1.05;
		const viewport = this.events.getViewport();
		const newScale = evt.evt.deltaY > 0 ? viewport.zoom / scaleBy : viewport.zoom * scaleBy;
		this.events.viewportChange(zoomViewportAt(viewport, pointer, newScale));
	}
}
