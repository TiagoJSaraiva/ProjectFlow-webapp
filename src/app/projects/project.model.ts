export interface Project {
  id: string;
  nome: string;
  descricao: string | null;
  dataCriado: string;
  ultimaAlteracao: string;
  usuarioId: string;
  usuarioNome: string;
  totalTarefas: number;
}

export interface CreateProjectPayload {
  nome: string;
  descricao?: string | null;
}
