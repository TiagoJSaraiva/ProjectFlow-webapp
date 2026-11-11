import { exportFileBaseName, parseDiagramJson, serializeDiagram } from './diagram-io';
import { DiagramConnection, DiagramNode } from './project-board.model';

const NODES: DiagramNode[] = [
  { id: 'n1', type: 'RECTANGLE', name: 'Início', description: 'Começo', x: 10, y: 20, width: 220, height: 100, rotation: 0 },
  { id: 'n2', type: 'CIRCLE', name: 'Fim', description: '', x: 400, y: 20, radius: 50, rotation: 0 }
];
const CONNECTIONS: DiagramConnection[] = [{ id: 'c1', fromNodeId: 'n1', toNodeId: 'n2' }];
const VIEWPORT = { zoom: 1.5, offsetX: 30, offsetY: 40, gridSize: 64 };

function exported(): string {
  return serializeDiagram(
    { projectName: 'Meu fluxo', projectDescription: 'Desc', viewport: VIEWPORT, nodes: NODES, connections: CONNECTIONS },
    new Date('2026-01-01T00:00:00Z')
  );
}

function withChange(mutate: (data: Record<string, any>) => void): string {
  const data = JSON.parse(exported());
  mutate(data);
  return JSON.stringify(data);
}

describe('diagram-io', () => {
  describe('serializeDiagram', () => {
    it('gera JSON com formato, versão e conteúdo do diagrama', () => {
      const data = JSON.parse(exported());
      expect(data.format).toBe('projectflow-diagram');
      expect(data.version).toBe(1);
      expect(data.exportedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(data.project).toEqual({ name: 'Meu fluxo', description: 'Desc' });
      expect(data.nodes.length).toBe(2);
      expect(data.connections.length).toBe(1);
    });
  });

  describe('parseDiagramJson', () => {
    it('faz o round-trip de exportar e importar, preservando a estrutura', () => {
      const result = parseDiagramJson(exported());
      expect(result.ok).toBeTrue();
      if (!result.ok) {
        return;
      }
      const { nodes, connections, viewport } = result.diagram;
      expect(nodes.map((n) => [n.name, n.type, n.x, n.y])).toEqual([
        ['Início', 'RECTANGLE', 10, 20],
        ['Fim', 'CIRCLE', 400, 20]
      ]);
      expect(nodes[0].width).toBe(220);
      expect(nodes[1].radius).toBe(50);
      expect(viewport).toEqual(VIEWPORT);
      // ids são regenerados, mas a conexão continua ligando os mesmos nós
      expect(nodes[0].id).not.toBe('n1');
      expect(connections[0].fromNodeId).toBe(nodes[0].id);
      expect(connections[0].toNodeId).toBe(nodes[1].id);
    });

    it('rejeita texto que não é JSON', () => {
      const result = parseDiagramJson('isto não é json');
      expect(result).toEqual({ ok: false, error: 'O arquivo não é um JSON válido.' });
    });

    it('rejeita JSON que não é um diagrama do ProjectFlow', () => {
      const result = parseDiagramJson('{"nodes": []}');
      expect(result.ok).toBeFalse();
      expect((result as { error: string }).error).toContain('não é um diagrama exportado pelo ProjectFlow');
    });

    it('rejeita versão não suportada', () => {
      const result = parseDiagramJson(withChange((d) => (d['version'] = 99)));
      expect((result as { error: string }).error).toContain('Versão de arquivo não suportada (99)');
    });

    it('rejeita nome de nó com mais de 35 caracteres, indicando qual elemento', () => {
      const result = parseDiagramJson(withChange((d) => (d['nodes'][1].name = 'x'.repeat(36))));
      expect((result as { error: string }).error).toBe('Elemento 2 tem nome com mais de 35 caracteres.');
    });

    it('rejeita tipo de nó desconhecido e posição inválida', () => {
      expect(parseDiagramJson(withChange((d) => (d['nodes'][0].type = 'TRIANGLE'))).ok).toBeFalse();
      expect(parseDiagramJson(withChange((d) => (d['nodes'][0].x = 'dez'))).ok).toBeFalse();
      expect(parseDiagramJson(withChange((d) => (d['nodes'][0].y = 1e12))).ok).toBeFalse();
    });

    it('rejeita ids repetidos', () => {
      const result = parseDiagramJson(withChange((d) => (d['nodes'][1].id = 'n1')));
      expect((result as { error: string }).error).toContain('repete um identificador');
    });

    it('rejeita conexão para elemento inexistente ou para o próprio elemento', () => {
      const dangling = parseDiagramJson(withChange((d) => (d['connections'][0].toNodeId = 'zzz')));
      expect((dangling as { error: string }).error).toBe('Conexão 1 aponta para um elemento que não existe no arquivo.');
      const loop = parseDiagramJson(withChange((d) => (d['connections'][0].toNodeId = 'n1')));
      expect((loop as { error: string }).error).toContain('liga um elemento a ele mesmo');
    });

    it('limita tamanhos e descarta campos desconhecidos', () => {
      const result = parseDiagramJson(
        withChange((d) => {
          d['nodes'][0].width = 99999;
          d['nodes'][0].evil = '<script>';
          d['viewport'].zoom = 50;
        })
      );
      expect(result.ok).toBeTrue();
      if (result.ok) {
        expect(result.diagram.nodes[0].width).toBe(600);
        expect((result.diagram.nodes[0] as unknown as Record<string, unknown>)['evil']).toBeUndefined();
        expect(result.diagram.viewport.zoom).toBe(2.5);
      }
    });

    it('rejeita arquivos com elementos demais', () => {
      const result = parseDiagramJson(
        withChange((d) => {
          d['nodes'] = Array.from({ length: 501 }, (_, i) => ({ id: 'n' + i, type: 'CIRCLE', name: 'n', x: 0, y: 0 }));
          d['connections'] = [];
        })
      );
      expect((result as { error: string }).error).toContain('elementos demais');
    });
  });

  describe('exportFileBaseName', () => {
    it('gera nomes de arquivo seguros', () => {
      expect(exportFileBaseName('Cadastro de usuário')).toBe('cadastro-de-usuario');
      expect(exportFileBaseName('  ../Pedido #1!  ')).toBe('pedido-1');
      expect(exportFileBaseName('???')).toBe('diagrama');
    });
  });
});
