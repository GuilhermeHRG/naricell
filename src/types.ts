import type { Timestamp } from 'firebase/firestore';

export type Perfil = 'ADMIN' | 'ATENDENTE';
export type StatusOS =
  | 'ABERTA'
  | 'AGUARDANDO_DIAGNOSTICO'
  | 'AGUARDANDO_APROVACAO'
  | 'AGUARDANDO_PECA'
  | 'EM_MANUTENCAO'
  | 'PRONTA_PARA_RETIRADA'
  | 'ENTREGUE'
  | 'CANCELADA'
  | 'SEM_CONSERTO';

export type TipoBloqueio = 'NENHUM' | 'PIN' | 'SENHA' | 'PADRAO';
export type TimestampValue = Timestamp | Date | null;
export type FormaPagamentoVenda = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'CARTEIRA';

export interface EntityBase {
  id: string;
  criadoEm?: TimestampValue;
  atualizadoEm?: TimestampValue;
}

export interface Usuario extends EntityBase {
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  empresaId?: string;
  empresaNome?: string;
  authUid?: string;
}

export interface Cliente extends EntityBase {
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
  ativo: boolean;
}

export interface Produto extends EntityBase {
  codigo: string;
  descricao: string;
  categoria?: string;
  marca?: string;
  modeloCompativel?: string;
  custo: number;
  precoVenda: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  localizacao?: string;
  fornecedor?: string;
  ativo: boolean;
}

export interface Servico extends EntityBase {
  descricao: string;
  categoria?: string;
  precoPadrao: number;
  garantiaDias: number;
  ativo: boolean;
}

export interface OrdemServico extends EntityBase {
  numero: number;
  clienteId?: string;
  clienteNome: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  aparelhoMarca: string;
  aparelhoModelo: string;
  aparelhoImei?: string;
  aparelhoCor?: string;
  acessorios?: string;
  defeitoRelatado: string;
  diagnostico?: string;
  status: StatusOS;
  tecnicoId?: string;
  tecnicoNome?: string;
  previsaoEntrega?: string;
  valorServicos: number;
  valorProdutos: number;
  desconto: number;
  valorTotal: number;
  garantiaDias: number;
  observacoesInternas?: string;
  estoqueBaixado: boolean;
  criadoPor: string;
  tipoBloqueio?: TipoBloqueio;
  codigoBloqueio?: string;
  padraoBloqueio?: number[];
  pagamentoRegistrado?: boolean;
  formaPagamento?: FormaPagamentoVenda;
  dataPagamento?: string;
  movimentacaoCaixaId?: string;
  contaReceberId?: string;
  registroFinanceiroId?: string;
}

export interface OrdemServicoItem extends EntityBase {
  tipo: 'PRODUTO' | 'SERVICO';
  produtoId?: string;
  servicoId?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface MovimentacaoEstoque extends EntityBase {
  produtoId: string;
  produtoDescricao: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE';
  quantidade: number;
  saldoAnterior: number;
  saldoPosterior: number;
  motivo: string;
  ordemServicoId?: string;
  ordemServicoNumero?: number;
  usuarioId: string;
  usuarioNome: string;
}

export interface ContaReceber extends EntityBase {
  clienteId?: string;
  clienteNome: string;
  ordemServicoId?: string;
  ordemServicoNumero?: number;
  vendaId?: string;
  vendaNumero?: number;
  descricao: string;
  valorOriginal: number;
  valorAberto: number;
  vencimento: string;
  status: 'ABERTA' | 'PARCIAL' | 'RECEBIDA' | 'CANCELADA';
  observacoes?: string;
  registroFinanceiroId?: string;
}

export interface Recebimento extends EntityBase {
  contaReceberId: string;
  clienteNome: string;
  valor: number;
  data: string;
  formaPagamento: string;
  observacoes?: string;
  usuarioId: string;
  usuarioNome: string;
}

export interface Fornecedor extends EntityBase {
  nome: string;
  cpfCnpj?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
  ativo: boolean;
}

export interface ContaPagar extends EntityBase {
  fornecedorId?: string;
  fornecedorNome: string;
  descricao: string;
  categoria?: string;
  valorOriginal: number;
  valorAberto: number;
  vencimento: string;
  status: 'ABERTA' | 'PARCIAL' | 'PAGA' | 'CANCELADA';
  observacoes?: string;
}

export interface Pagamento extends EntityBase {
  contaPagarId: string;
  fornecedorNome: string;
  valor: number;
  data: string;
  formaPagamento: string;
  observacoes?: string;
  usuarioId: string;
  usuarioNome: string;
}

export interface ConfiguracaoEmpresa {
  nomeFantasia: string;
  razaoSocial?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  garantiaPadraoDias: number;
  logoUrl?: string;
}


export interface LicencaSistema extends EntityBase {
  clienteNome: string;
  plano: string;
  ativo: boolean;
  venceEm?: TimestampValue;
  valorMensal: number;
  observacoes?: string;
  atualizadoPor?: string;
  atualizadoPorEmail?: string;
}


export interface MovimentacaoCaixa extends EntityBase {
  tipo: 'ENTRADA' | 'SAIDA';
  origem: 'ORDEM_SERVICO' | 'VENDA' | 'RECEBIMENTO' | 'PAGAMENTO' | 'MANUAL';
  origemId?: string;
  origemNumero?: number;
  descricao: string;
  clienteId?: string;
  clienteNome?: string;
  valor: number;
  formaPagamento: Exclude<FormaPagamentoVenda, 'CARTEIRA'> | string;
  data: string;
  usuarioId: string;
  usuarioNome: string;
}

export interface FechamentoCaixa extends EntityBase {
  data: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  quantidadeMovimentacoes: number;
  fechadoPorId: string;
  fechadoPorNome: string;
}

export interface Venda extends EntityBase {
  numero: number;
  clienteId?: string;
  clienteNome: string;
  valorTotal: number;
  formaPagamento: FormaPagamentoVenda;
  status: 'CONCLUIDA' | 'CANCELADA';
  contaReceberId?: string;
  movimentacaoCaixaId?: string;
  registroFinanceiroId?: string;
  observacoes?: string;
  usuarioId: string;
  usuarioNome: string;
}

export interface VendaItem extends EntityBase {
  produtoId: string;
  produtoDescricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}
