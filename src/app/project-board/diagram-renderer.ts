import Konva from 'konva';
import { computeBendPoint } from './connection-geometry';
import { DEFAULT_RADIUS, DEFAULT_RECT } from './diagram-constants';
import { DiagramConnection, DiagramNode, DiagramViewport } from './project-board.model';
import { zoomViewportAt } from './viewport-math';

/** Eventos que o renderizador devolve ao dono do estado. */
export interface RendererEvents {
	getViewport(): DiagramViewport;
	nodeClick(nodeId: string): void;
	nodeDragMove(nodeId: string, x: number, y: number): void;
	nodeDragEnd(nodeId: string, x: number, y: number): void;
	backgroundClick(): void;
	/** Pan/zoom em andamento (atualiza o viewport). */
	viewportChange(viewport: DiagramViewport): void;
	/** Pan/zoom concluído (conta como alteração do projeto). */
	viewportCommit(): void;
}

const PALETTE = { fill: '#0f1115', stroke: '#393b46', activeStroke: '#f7d046', text: '#f3f3f3' };

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

	constructor(
		private readonly container: HTMLDivElement,
		private readonly events: RendererEvents
	) {
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
		this.stage.on('mousemove touchmove', () => this.onPointerMove());
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
		this.drawGrid(viewport.gridSize);
	}

	renderNodes(nodes: DiagramNode[], selectedId: string | null): void {
		this.nodeGroup.destroyChildren();
		for (const node of nodes) {
			const group = new Konva.Group({ x: node.x, y: node.y, draggable: true, listening: true, id: node.id });
			group.on('dragmove', () => this.events.nodeDragMove(node.id, group.x(), group.y()));
			group.on('dragend', () => this.events.nodeDragEnd(node.id, group.x(), group.y()));
			group.on('click tap', (evt) => {
				evt.cancelBubble = true;
				this.events.nodeClick(node.id);
			});

			const stroke = selectedId === node.id ? PALETTE.activeStroke : PALETTE.stroke;
			if (node.type === 'RECTANGLE') {
				const width = node.width ?? DEFAULT_RECT.width;
				const height = node.height ?? DEFAULT_RECT.height;
				group.add(
					new Konva.Rect({ width, height, cornerRadius: 24, fill: PALETTE.fill, stroke, strokeWidth: 2, offsetX: width / 2, offsetY: height / 2 })
				);
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
			this.nodeGroup.add(group);
		}
		this.nodeLayer.batchDraw();
	}

	renderConnections(nodes: DiagramNode[], connections: DiagramConnection[]): void {
		this.connectionGroup.destroyChildren();
		const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
		for (const connection of connections) {
			const from = nodesById.get(connection.fromNodeId);
			const to = nodesById.get(connection.toNodeId);
			if (!from || !to) {
				continue;
			}
			const bend = computeBendPoint(from, to);
			this.connectionGroup.add(
				new Konva.Line({ points: [from.x, from.y, bend.x, bend.y, to.x, to.y], stroke: '#f7d046', strokeWidth: 3, lineCap: 'round', lineJoin: 'round' })
			);
		}
		this.connectionLayer.batchDraw();
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
			this.events.viewportCommit();
		}
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
		this.events.viewportCommit();
	}
}
