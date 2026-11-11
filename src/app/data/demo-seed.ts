import { DiagramConnection, DiagramNode, ProjectDiagramResponse } from '../project-board/project-board.model';
import { computeBendPoint } from '../project-board/connection-geometry';
import { Project } from '../projects/project.model';

export interface DemoDatabase {
  version: 1;
  projects: Project[];
  diagrams: Record<string, ProjectDiagramResponse>;
}

interface StepSpec {
  id: string;
  type: 'RECTANGLE' | 'CIRCLE';
  name: string;
  description: string;
}

/** Posições em "serpentina": 3 passos na primeira linha e 3 na segunda, da direita para a esquerda. */
const SLOTS = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 600, y: 0 },
  { x: 600, y: 260 },
  { x: 300, y: 260 },
  { x: 0, y: 260 }
];

function buildDiagram(projectId: string, name: string, description: string, steps: StepSpec[]): ProjectDiagramResponse {
  const nodes: DiagramNode[] = steps.map((step, index) => ({
    id: step.id,
    type: step.type,
    name: step.name,
    description: step.description,
    x: SLOTS[index].x,
    y: SLOTS[index].y,
    width: step.type === 'RECTANGLE' ? 200 : undefined,
    height: step.type === 'RECTANGLE' ? 120 : undefined,
    radius: step.type === 'CIRCLE' ? 64 : undefined,
    rotation: 0
  }));
  const connections: DiagramConnection[] = nodes.slice(1).map((target, index) => {
    const source = nodes[index];
    return {
      id: `${projectId}-c${index + 1}`,
      fromNodeId: source.id,
      toNodeId: target.id,
      bendPoint: computeBendPoint(source, target),
      style: { stroke: '#f7d046' }
    };
  });
  return {
    projectId,
    projectName: name,
    projectDescription: description,
    viewport: { zoom: 0.85, offsetX: 190, offsetY: 150, gridSize: 64 },
    nodes,
    connections
  };
}

export const SIGNUP_PROJECT_ID = 'demo-cadastro-usuario';
export const ORDER_PROJECT_ID = 'demo-pedido-compra';

/** Cria o banco de exemplos (2 projetos com diagramas coerentes). As datas partem de `now`. */
export function createDemoDatabase(now: Date = new Date()): DemoDatabase {
  const signup = buildDiagram(
    SIGNUP_PROJECT_ID,
    'Cadastro de usuário',
    'Fluxo de exemplo: da tela de cadastro até a conta ativa.',
    [
      { id: 'cad-inicio', type: 'CIRCLE', name: 'Início', description: 'Visitante abre a página de cadastro.' },
      { id: 'cad-form', type: 'RECTANGLE', name: 'Preencher formulário', description: 'Nome, e-mail e senha.' },
      { id: 'cad-valida', type: 'RECTANGLE', name: 'Validar dados', description: 'Formato do e-mail e força da senha.' },
      { id: 'cad-email', type: 'RECTANGLE', name: 'Enviar e-mail de confirmação', description: 'Link de uso único, válido por 60 minutos.' },
      { id: 'cad-confirma', type: 'RECTANGLE', name: 'Confirmar e-mail', description: 'Usuário clica no link recebido.' },
      { id: 'cad-fim', type: 'CIRCLE', name: 'Conta ativa', description: 'Usuário já pode entrar e criar projetos.' }
    ]
  );
  const order = buildDiagram(
    ORDER_PROJECT_ID,
    'Pedido de compra',
    'Fluxo de exemplo: do carrinho ao envio do pedido.',
    [
      { id: 'ped-inicio', type: 'CIRCLE', name: 'Carrinho', description: 'Cliente revisa os itens escolhidos.' },
      { id: 'ped-endereco', type: 'RECTANGLE', name: 'Informar endereço', description: 'Endereço de entrega e frete.' },
      { id: 'ped-pagamento', type: 'RECTANGLE', name: 'Escolher pagamento', description: 'Cartão, Pix ou boleto.' },
      { id: 'ped-aprova', type: 'RECTANGLE', name: 'Aprovar pagamento', description: 'Operadora confirma a cobrança.' },
      { id: 'ped-separa', type: 'RECTANGLE', name: 'Separar e embalar', description: 'Estoque prepara o pedido.' },
      { id: 'ped-envio', type: 'CIRCLE', name: 'Pedido enviado', description: 'Código de rastreio enviado ao cliente.' }
    ]
  );

  const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const project = (diagram: ProjectDiagramResponse, createdMinutesAgo: number): Project => ({
    id: diagram.projectId,
    nome: diagram.projectName,
    descricao: diagram.projectDescription,
    dataCriado: iso(createdMinutesAgo),
    ultimaAlteracao: iso(createdMinutesAgo),
    ultimoAcesso: iso(createdMinutesAgo),
    usuarioId: 'demo',
    usuarioNome: 'Demonstração',
    totalTarefas: diagram.nodes.length
  });

  return {
    version: 1,
    projects: [project(signup, 120), project(order, 60)],
    diagrams: { [SIGNUP_PROJECT_ID]: signup, [ORDER_PROJECT_ID]: order }
  };
}
