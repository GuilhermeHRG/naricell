import {
  deleteDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { ContaPagar, ContaReceber, OrdemServico, OrdemServicoItem, Produto, Venda, VendaItem } from '../types';
import { db } from './firebase';
import { empresaCollection, empresaDoc, empresaSubcollection } from './tenant';

type Documento = QueryDocumentSnapshot;

const adicionarDocumento = (destino: Map<string, DocumentReference>, referencia: DocumentReference) => {
  destino.set(referencia.path, referencia);
};

const adicionarDocumentos = (destino: Map<string, DocumentReference>, documentos: Documento[]) => {
  documentos.forEach((documento) => adicionarDocumento(destino, documento.ref));
};

const buscarPorCampo = async (empresaId: string, colecao: string, campo: string, valor: string) => {
  const resultado = await getDocs(query(empresaCollection(empresaId, colecao), where(campo, '==', valor)));
  return resultado.docs;
};

const garantirLimiteDaTransacao = (quantidadeExclusoes: number, quantidadeProdutos = 0) => {
  if (quantidadeExclusoes + quantidadeProdutos > 450) {
    throw new Error('Este registro possui muitos vínculos para exclusão pelo sistema. Procure o administrador.');
  }
};

const mapearReposicaoDeEstoque = <T extends OrdemServicoItem | VendaItem>(
  itens: T[],
  deveRepor: boolean,
) => {
  const reposicoes = new Map<string, number>();
  if (!deveRepor) return reposicoes;
  itens.forEach((item) => {
    const produtoId = item.produtoId;
    if (!produtoId || ('tipo' in item && item.tipo !== 'PRODUTO')) return;
    reposicoes.set(produtoId, (reposicoes.get(produtoId) ?? 0) + Number(item.quantidade || 0));
  });
  return reposicoes;
};

async function adicionarVinculosDaContaReceber(
  empresaId: string,
  contaId: string,
  exclusoes: Map<string, DocumentReference>,
) {
  const [recebimentos, movimentos, registros] = await Promise.all([
    buscarPorCampo(empresaId, 'recebimentos', 'contaReceberId', contaId),
    buscarPorCampo(empresaId, 'movimentacoesCaixa', 'origemId', contaId),
    buscarPorCampo(empresaId, 'registrosFinanceiros', 'contaReceberId', contaId),
  ]);
  adicionarDocumentos(exclusoes, recebimentos);
  adicionarDocumentos(
    exclusoes,
    movimentos.filter((movimento) => movimento.data().origem === 'RECEBIMENTO'),
  );
  adicionarDocumentos(exclusoes, registros);
}

export async function excluirMovimentacaoCaixa(empresaId: string, movimentoId: string) {
  await deleteDoc(empresaDoc(empresaId, 'movimentacoesCaixa', movimentoId));
}

export async function excluirContaReceber(empresaId: string, conta: ContaReceber) {
  const exclusoes = new Map<string, DocumentReference>();
  adicionarDocumento(exclusoes, empresaDoc(empresaId, 'contasReceber', conta.id));
  await adicionarVinculosDaContaReceber(empresaId, conta.id, exclusoes);

  if (conta.registroFinanceiroId) {
    adicionarDocumento(exclusoes, empresaDoc(empresaId, 'registrosFinanceiros', conta.registroFinanceiroId));
  }

  garantirLimiteDaTransacao(exclusoes.size);
  await runTransaction(db, async (transaction) => {
    exclusoes.forEach((referencia) => transaction.delete(referencia));
  });
}

export async function excluirContaPagar(empresaId: string, conta: ContaPagar) {
  const exclusoes = new Map<string, DocumentReference>();
  adicionarDocumento(exclusoes, empresaDoc(empresaId, 'contasPagar', conta.id));
  const [pagamentos, movimentos] = await Promise.all([
    buscarPorCampo(empresaId, 'pagamentos', 'contaPagarId', conta.id),
    buscarPorCampo(empresaId, 'movimentacoesCaixa', 'origemId', conta.id),
  ]);
  adicionarDocumentos(exclusoes, pagamentos);
  adicionarDocumentos(
    exclusoes,
    movimentos.filter((movimento) => movimento.data().origem === 'PAGAMENTO'),
  );

  garantirLimiteDaTransacao(exclusoes.size);
  await runTransaction(db, async (transaction) => {
    exclusoes.forEach((referencia) => transaction.delete(referencia));
  });
}

export async function excluirOrdemServico(empresaId: string, ordem: OrdemServico) {
  const [itensSnap, historicoSnap, movimentosEstoque, movimentosCaixa, registrosFinanceiros, contasReceber] = await Promise.all([
    getDocs(empresaSubcollection(empresaId, 'ordensServico', ordem.id, 'itens')),
    getDocs(empresaSubcollection(empresaId, 'ordensServico', ordem.id, 'historico')),
    buscarPorCampo(empresaId, 'movimentacoesEstoque', 'ordemServicoId', ordem.id),
    buscarPorCampo(empresaId, 'movimentacoesCaixa', 'origemId', ordem.id),
    buscarPorCampo(empresaId, 'registrosFinanceiros', 'origemId', ordem.id),
    buscarPorCampo(empresaId, 'contasReceber', 'ordemServicoId', ordem.id),
  ]);
  const itens = itensSnap.docs.map((item) => ({ id: item.id, ...item.data() } as OrdemServicoItem));
  const reposicoes = mapearReposicaoDeEstoque(itens, ordem.estoqueBaixado === true);
  const exclusoes = new Map<string, DocumentReference>();

  adicionarDocumento(exclusoes, empresaDoc(empresaId, 'ordensServico', ordem.id));
  adicionarDocumentos(exclusoes, itensSnap.docs);
  adicionarDocumentos(exclusoes, historicoSnap.docs);
  adicionarDocumentos(exclusoes, movimentosEstoque);
  adicionarDocumentos(
    exclusoes,
    movimentosCaixa.filter((movimento) => movimento.data().origem === 'ORDEM_SERVICO'),
  );
  adicionarDocumentos(
    exclusoes,
    registrosFinanceiros.filter((registro) => registro.data().origem === 'ORDEM_SERVICO'),
  );

  const contas = new Map<string, ContaReceber>();
  contasReceber.forEach((documento) => contas.set(documento.id, { id: documento.id, ...documento.data() } as ContaReceber));
  if (ordem.contaReceberId && !contas.has(ordem.contaReceberId)) {
    contas.set(ordem.contaReceberId, { id: ordem.contaReceberId } as ContaReceber);
  }
  for (const conta of contas.values()) {
    adicionarDocumento(exclusoes, empresaDoc(empresaId, 'contasReceber', conta.id));
    await adicionarVinculosDaContaReceber(empresaId, conta.id, exclusoes);
    if (conta.registroFinanceiroId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'registrosFinanceiros', conta.registroFinanceiroId));
  }
  if (ordem.movimentacaoCaixaId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'movimentacoesCaixa', ordem.movimentacaoCaixaId));
  if (ordem.registroFinanceiroId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'registrosFinanceiros', ordem.registroFinanceiroId));

  garantirLimiteDaTransacao(exclusoes.size, reposicoes.size);
  await runTransaction(db, async (transaction) => {
    const produtos = new Map<string, { referencia: DocumentReference; produto: Produto }>();
    for (const produtoId of reposicoes.keys()) {
      const referencia = empresaDoc(empresaId, 'produtos', produtoId);
      const snap = await transaction.get(referencia);
      if (!snap.exists()) throw new Error('Não foi possível devolver uma peça ao estoque porque o produto não existe mais.');
      produtos.set(produtoId, { referencia, produto: snap.data() as Produto });
    }

    reposicoes.forEach((quantidade, produtoId) => {
      const produto = produtos.get(produtoId)!;
      transaction.update(produto.referencia, {
        estoqueAtual: Number(produto.produto.estoqueAtual || 0) + quantidade,
        atualizadoEm: serverTimestamp(),
      });
    });
    exclusoes.forEach((referencia) => transaction.delete(referencia));
  });
}

export async function excluirVenda(empresaId: string, venda: Venda) {
  const [itensSnap, movimentosEstoque, movimentosCaixa, registrosFinanceiros, contasReceber] = await Promise.all([
    getDocs(empresaSubcollection(empresaId, 'vendas', venda.id, 'itens')),
    buscarPorCampo(empresaId, 'movimentacoesEstoque', 'vendaId', venda.id),
    buscarPorCampo(empresaId, 'movimentacoesCaixa', 'origemId', venda.id),
    buscarPorCampo(empresaId, 'registrosFinanceiros', 'origemId', venda.id),
    buscarPorCampo(empresaId, 'contasReceber', 'vendaId', venda.id),
  ]);
  const itens = itensSnap.docs.map((item) => ({ id: item.id, ...item.data() } as VendaItem));
  const reposicoes = mapearReposicaoDeEstoque(itens, venda.status === 'CONCLUIDA');
  const exclusoes = new Map<string, DocumentReference>();

  adicionarDocumento(exclusoes, empresaDoc(empresaId, 'vendas', venda.id));
  adicionarDocumentos(exclusoes, itensSnap.docs);
  adicionarDocumentos(exclusoes, movimentosEstoque);
  adicionarDocumentos(
    exclusoes,
    movimentosCaixa.filter((movimento) => movimento.data().origem === 'VENDA'),
  );
  adicionarDocumentos(
    exclusoes,
    registrosFinanceiros.filter((registro) => registro.data().origem === 'VENDA'),
  );

  const contas = new Map<string, ContaReceber>();
  contasReceber.forEach((documento) => contas.set(documento.id, { id: documento.id, ...documento.data() } as ContaReceber));
  if (venda.contaReceberId && !contas.has(venda.contaReceberId)) {
    contas.set(venda.contaReceberId, { id: venda.contaReceberId } as ContaReceber);
  }
  for (const conta of contas.values()) {
    adicionarDocumento(exclusoes, empresaDoc(empresaId, 'contasReceber', conta.id));
    await adicionarVinculosDaContaReceber(empresaId, conta.id, exclusoes);
    if (conta.registroFinanceiroId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'registrosFinanceiros', conta.registroFinanceiroId));
  }
  if (venda.movimentacaoCaixaId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'movimentacoesCaixa', venda.movimentacaoCaixaId));
  if (venda.registroFinanceiroId) adicionarDocumento(exclusoes, empresaDoc(empresaId, 'registrosFinanceiros', venda.registroFinanceiroId));

  garantirLimiteDaTransacao(exclusoes.size, reposicoes.size);
  await runTransaction(db, async (transaction) => {
    const produtos = new Map<string, { referencia: DocumentReference; produto: Produto }>();
    for (const produtoId of reposicoes.keys()) {
      const referencia = empresaDoc(empresaId, 'produtos', produtoId);
      const snap = await transaction.get(referencia);
      if (!snap.exists()) throw new Error('Não foi possível devolver uma peça ao estoque porque o produto não existe mais.');
      produtos.set(produtoId, { referencia, produto: snap.data() as Produto });
    }

    reposicoes.forEach((quantidade, produtoId) => {
      const produto = produtos.get(produtoId)!;
      transaction.update(produto.referencia, {
        estoqueAtual: Number(produto.produto.estoqueAtual || 0) + quantidade,
        atualizadoEm: serverTimestamp(),
      });
    });
    exclusoes.forEach((referencia) => transaction.delete(referencia));
  });
}
