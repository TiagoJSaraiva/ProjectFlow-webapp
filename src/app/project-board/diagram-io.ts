import { generateId } from '../shared/ids';
import { MAX_ZOOM, MIN_ZOOM, NODE_NAME_MAX_LENGTH, clampNodeSize } from './diagram-constants';
import { DiagramConnection, DiagramNode, DiagramViewport } from './project-board.model';

export const EXPORT_FORMAT = 'projectflow-diagram';
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_NODES = 500;
export const MAX_IMPORT_CONNECTIONS = 1000;
const COORDINATE_LIMIT = 1_000_000;

export interface DiagramContent {
	nodes: DiagramNode[];
	connections: DiagramConnection[];
	viewport: DiagramViewport;
}

export interface DiagramExportInput extends DiagramContent {
	projectName: string;
	projectDescription: string;
}

export type ParseResult = { ok: true; diagram: DiagramContent } | { ok: false; error: string };

/** Serializa o diagrama no formato de arquivo do ProjectFlow (JSON legível, com versão). */
export function serializeDiagram(input: DiagramExportInput, now: Date = new Date()): string {
	return JSON.stringify(
		{
			format: EXPORT_FORMAT,
			version: EXPORT_VERSION,
			exportedAt: now.toISOString(),
			project: { name: input.projectName, description: input.projectDescription },
			viewport: input.viewport,
			nodes: input.nodes,
			connections: input.connections
		},
		null,
		2
	);
}

/** Nome de arquivo seguro a partir do nome do projeto (ex.: "Cadastro de usuário" -> "cadastro-de-usuario"). */
export function exportFileBaseName(projectName: string): string {
	const slug = (projectName ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'diagrama';
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Lê e valida um arquivo JSON exportado pelo ProjectFlow. Só devolve dados saneados (campos
 * desconhecidos são descartados, tamanhos limitados) com novos ids, para não colidir com o servidor.
 */
export function parseDiagramJson(text: string): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return fail('O arquivo não é um JSON válido.');
	}
	if (!isRecord(raw) || raw['format'] !== EXPORT_FORMAT) {
		return fail('Este arquivo não é um diagrama exportado pelo ProjectFlow.');
	}
	if (raw['version'] !== EXPORT_VERSION) {
		return fail(`Versão de arquivo não suportada (${String(raw['version'])}). Esperada: ${EXPORT_VERSION}.`);
	}
	if (!Array.isArray(raw['nodes']) || !Array.isArray(raw['connections'])) {
		return fail('O arquivo não contém as listas de elementos e conexões.');
	}
	if (raw['nodes'].length > MAX_IMPORT_NODES) {
		return fail(`O diagrama tem elementos demais (máximo ${MAX_IMPORT_NODES}).`);
	}
	if (raw['connections'].length > MAX_IMPORT_CONNECTIONS) {
		return fail(`O diagrama tem conexões demais (máximo ${MAX_IMPORT_CONNECTIONS}).`);
	}

	const idMap = new Map<string, string>();
	const nodes: DiagramNode[] = [];
	for (const [index, item] of raw['nodes'].entries()) {
		const label = `Elemento ${index + 1}`;
		if (!isRecord(item)) {
			return fail(`${label} é inválido.`);
		}
		const id = item['id'];
		if (typeof id !== 'string' || !id) {
			return fail(`${label} não tem identificador.`);
		}
		if (idMap.has(id)) {
			return fail(`${label} repete um identificador já usado ("${id}").`);
		}
		const type = item['type'];
		if (type !== 'RECTANGLE' && type !== 'CIRCLE') {
			return fail(`${label} tem tipo desconhecido (use RECTANGLE ou CIRCLE).`);
		}
		const name = item['name'];
		if (typeof name !== 'string') {
			return fail(`${label} não tem nome.`);
		}
		if (name.length > NODE_NAME_MAX_LENGTH) {
			return fail(`${label} tem nome com mais de ${NODE_NAME_MAX_LENGTH} caracteres.`);
		}
		const description = item['description'] ?? '';
		if (typeof description !== 'string' || description.length > 500) {
			return fail(`${label} tem descrição inválida (máximo 500 caracteres).`);
		}
		const x = item['x'];
		const y = item['y'];
		if (!isFiniteNumber(x) || !isFiniteNumber(y) || Math.abs(x) > COORDINATE_LIMIT || Math.abs(y) > COORDINATE_LIMIT) {
			return fail(`${label} tem posição inválida.`);
		}
		const newId = generateId();
		idMap.set(id, newId);
		const node: DiagramNode = { id: newId, type, name, description, x, y, rotation: 0 };
		if (type === 'RECTANGLE') {
			node.width = clampNodeSize('width', isFiniteNumber(item['width']) ? item['width'] : 200);
			node.height = clampNodeSize('height', isFiniteNumber(item['height']) ? item['height'] : 120);
		} else {
			node.radius = clampNodeSize('radius', isFiniteNumber(item['radius']) ? item['radius'] : 64);
		}
		nodes.push(node);
	}

	const connections: DiagramConnection[] = [];
	for (const [index, item] of raw['connections'].entries()) {
		const label = `Conexão ${index + 1}`;
		if (!isRecord(item)) {
			return fail(`${label} é inválida.`);
		}
		const from = typeof item['fromNodeId'] === 'string' ? idMap.get(item['fromNodeId']) : undefined;
		const to = typeof item['toNodeId'] === 'string' ? idMap.get(item['toNodeId']) : undefined;
		if (!from || !to) {
			return fail(`${label} aponta para um elemento que não existe no arquivo.`);
		}
		if (from === to) {
			return fail(`${label} liga um elemento a ele mesmo.`);
		}
		connections.push({ id: generateId(), fromNodeId: from, toNodeId: to, style: { stroke: '#f7d046' } });
	}

	return { ok: true, diagram: { nodes, connections, viewport: parseViewport(raw['viewport']) } };
}

function parseViewport(value: unknown): DiagramViewport {
	const fallback: DiagramViewport = { zoom: 1, offsetX: 0, offsetY: 0, gridSize: 64 };
	if (!isRecord(value)) {
		return fallback;
	}
	const zoom = isFiniteNumber(value['zoom']) ? Math.min(Math.max(value['zoom'], MIN_ZOOM), MAX_ZOOM) : fallback.zoom;
	return {
		zoom,
		offsetX: isFiniteNumber(value['offsetX']) ? value['offsetX'] : 0,
		offsetY: isFiniteNumber(value['offsetY']) ? value['offsetY'] : 0,
		gridSize: isFiniteNumber(value['gridSize']) && value['gridSize'] >= 8 && value['gridSize'] <= 512 ? value['gridSize'] : fallback.gridSize
	};
}

function fail(error: string): ParseResult {
	return { ok: false, error };
}
