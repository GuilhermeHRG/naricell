import { doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ArrowDownCircle, ArrowUpCircle, Boxes, History, PlusCircle, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { dataHoraBr, normalizarTexto, numero } from '../lib/utils';
import type { MovimentacaoEstoque, Produto } from '../types';

export function EstoquePage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentos, setMovimentos] = useState<MovimentacaoEstoque[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [produtoId, setProdutoId] = useState('');
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA');
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { usuario, empresaId } = useAuth();
  const { showToast } = useToast();

  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'produtos'), orderBy('descricao')), (snap) => setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto))), () => showToast('Não foi possível carregar os produtos.', 'error')), [showToast, empresaId]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'movimentacoesEstoque'), orderBy('criadoEm', 'desc')), (snap) => setMovimentos(snap.docs.slice(0, 40).map((d) => ({ id: d.id, ...d.data() } as MovimentacaoEstoque))), () => showToast('Não foi possível carregar o histórico de estoque.', 'error')), [showToast, empresaId]);

  const filtrados = useMemo(() => { const termo = normalizarTexto(busca); return !termo ? produtos : produtos.filter((produto) => normalizarTexto(`${produto.codigo} ${produto.descricao}`).includes(termo)); }, [busca, produtos]);
  const abrirMovimento = () => { setProdutoId(produtos[0]?.id ?? ''); setTipo('ENTRADA'); setQuantidade(1); setMotivo(''); setModal(true); };

  const registrar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!produtoId) return showToast('Selecione um produto.', 'error');
    if (!Number.isFinite(quantidade) || quantidade <= 0) return showToast('Informe uma quantidade maior que zero.', 'error');
    if (!motivo.trim()) return showToast('Informe o motivo da movimentação.', 'error');
    if (!usuario) return;
    setSalvando(true);
    try {
      await runTransaction(db, async (transaction) => {
        const produtoRef = empresaDoc(empresaId!, 'produtos', produtoId);
        const produtoSnap = await transaction.get(produtoRef);
        if (!produtoSnap.exists()) throw new Error('Produto não encontrado.');
        const produto = produtoSnap.data() as Produto;
        const anterior = Number(produto.estoqueAtual || 0);
        const posterior = tipo === 'ENTRADA' ? anterior + quantidade : tipo === 'SAIDA' ? anterior - quantidade : quantidade;
        if (posterior < 0) throw new Error(`Estoque insuficiente. Saldo atual: ${numero(anterior)}.`);
        const movimentoRef = doc(empresaCollection(empresaId!, 'movimentacoesEstoque'));
        transaction.update(produtoRef, { estoqueAtual: posterior, atualizadoEm: serverTimestamp() });
        transaction.set(movimentoRef, { produtoId, produtoDescricao: produto.descricao, tipo, quantidade: tipo === 'AJUSTE' ? Math.abs(posterior - anterior) : quantidade, saldoAnterior: anterior, saldoPosterior: posterior, motivo: motivo.trim(), usuarioId: usuario.id, usuarioNome: usuario.nome, criadoEm: serverTimestamp() });
      });
      showToast('Movimentação de estoque registrada.'); setModal(false);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.', 'error'); }
    finally { setSalvando(false); }
  };

  return <>
    <section className="page-heading"><div><p className="eyebrow">CONTROLE DE ESTOQUE</p><h2>Movimentações e saldos</h2><p>Entradas, saídas e ajustes ficam registrados em histórico.</p></div><button className="button button-primary" onClick={abrirMovimento}><PlusCircle size={18} />Nova movimentação</button></section>
    <div className="dashboard-columns inventory-columns"><section className="panel"><div className="panel-header"><div><h3>Saldo dos produtos</h3><p>Itens em estoque e ponto de reposição</p></div><Boxes size={21} /></div><div className="toolbar"><label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" /></label></div><div className="stock-list">{filtrados.map((produto) => <div className="stock-product" key={produto.id}><div><strong>{produto.descricao}</strong><span>{produto.codigo} · mínimo {numero(produto.estoqueMinimo)}</span></div><div className={produto.estoqueAtual <= produto.estoqueMinimo ? 'stock-critical-value' : 'stock-value'}>{numero(produto.estoqueAtual)} <small>un.</small></div></div>)}{filtrados.length === 0 && <div className="empty-state">Nenhum produto encontrado.</div>}</div></section>
      <section className="panel"><div className="panel-header"><div><h3>Últimas movimentações</h3><p>Histórico auditável do estoque</p></div><History size={21} /></div><div className="simple-list movements">{movimentos.map((movimento) => <div className="movement-row" key={movimento.id}><div className={`movement-icon ${movimento.tipo.toLowerCase()}`}>{movimento.tipo === 'ENTRADA' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}</div><div className="list-primary"><strong>{movimento.produtoDescricao}</strong><span>{movimento.motivo} · {dataHoraBr(movimento.criadoEm)}</span></div><div className="movement-quantity"><strong>{movimento.tipo === 'ENTRADA' ? '+' : movimento.tipo === 'SAIDA' ? '-' : '↔'} {numero(movimento.quantidade)}</strong><small>{numero(movimento.saldoAnterior)} → {numero(movimento.saldoPosterior)}</small></div></div>)}{movimentos.length === 0 && <div className="empty-state compact">Sem movimentações registradas.</div>}</div></section></div>
    <Modal aberto={modal} aoFechar={() => setModal(false)} titulo="Nova movimentação de estoque"><form className="form-grid" onSubmit={registrar}><label className="field field-full"><span>Produto *</span><select required value={produtoId} onChange={(e) => setProdutoId(e.target.value)}><option value="">Selecione</option>{produtos.filter((p) => p.ativo).map((produto) => <option key={produto.id} value={produto.id}>{produto.descricao} — saldo: {numero(produto.estoqueAtual)}</option>)}</select></label><label className="field"><span>Tipo *</span><select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option><option value="AJUSTE">Ajustar para saldo informado</option></select></label><label className="field"><span>{tipo === 'AJUSTE' ? 'Novo saldo *' : 'Quantidade *'}</span><input required min="0.01" step="0.01" type="number" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 0))} /></label><label className="field field-full"><span>Motivo *</span><input required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'ENTRADA' ? 'Ex.: Compra de fornecedor' : tipo === 'SAIDA' ? 'Ex.: Consumo interno' : 'Ex.: Conferência de inventário'} /></label><div className="info-box field-full">A saída manual não deve ser usada para peças de uma ordem de serviço. A baixa dessas peças é feita ao concluir a OS.</div><div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Registrando...' : 'Registrar movimentação'}</button></div></form></Modal>
  </>;
}
