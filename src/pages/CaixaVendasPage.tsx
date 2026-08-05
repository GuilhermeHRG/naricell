import { doc, getDocs, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { Banknote, CalendarRange, CheckCircle2, LockKeyhole, PlusCircle, ShoppingCart, Trash2, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { excluirMovimentacaoCaixa, excluirVenda } from '../lib/exclusoes';
import { empresaCollection, empresaDoc, empresaSubcollection } from '../lib/tenant';
import { dataBr, hojeIso, moeda, timestampParaIsoLocal } from '../lib/utils';
import type { Cliente, FechamentoCaixa, FormaPagamentoVenda, MovimentacaoCaixa, Produto, Venda, VendaItem } from '../types';

type ItemRascunho = VendaItem & { id: string };
const formas: { value: FormaPagamentoVenda; label: string }[] = [
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'PIX', label: 'Pix' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'CARTEIRA', label: 'Carteira / a receber' },
];

export function CaixaVendasPage() {
  const { usuario, empresaId } = useAuth();
  const { showToast } = useToast();
  const [movimentos, setMovimentos] = useState<MovimentacaoCaixa[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modalVenda, setModalVenda] = useState(false);
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState(1);
  const [valorUnitario, setValorUnitario] = useState(0);
  const [itens, setItens] = useState<ItemRascunho[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoVenda>('DINHEIRO');
  const [vencimento, setVencimento] = useState(hojeIso());
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [dataInicial, setDataInicial] = useState(hojeIso());
  const [dataFinal, setDataFinal] = useState(hojeIso());
  const [fechamentoHoje, setFechamentoHoje] = useState<FechamentoCaixa | null>(null);
  const [fechandoCaixa, setFechandoCaixa] = useState(false);

  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'movimentacoesCaixa'), orderBy('criadoEm', 'desc')), (snap) => setMovimentos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MovimentacaoCaixa))), () => showToast('Não foi possível carregar o fluxo de caixa.', 'error')), [empresaId, showToast]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'vendas'), orderBy('criadoEm', 'desc')), (snap) => setVendas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Venda))), () => showToast('Não foi possível carregar as vendas.', 'error')), [empresaId, showToast]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'produtos'), orderBy('descricao')), (snap) => setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto))), () => undefined), [empresaId]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'clientes'), orderBy('nome')), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente))), () => undefined), [empresaId]);
  useEffect(() => onSnapshot(empresaDoc(empresaId!, 'fechamentosCaixa', hojeIso()), (snap) => setFechamentoHoje(snap.exists() ? ({ id: snap.id, ...snap.data() } as FechamentoCaixa) : null), () => undefined), [empresaId]);

  const podeVender = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'ATENDENTE';
  const podeExcluir = usuario?.perfil === 'ADMIN';
  const totalVenda = useMemo(() => itens.reduce((soma, item) => soma + Number(item.valorTotal || 0), 0), [itens]);
  const periodoValido = !dataInicial || !dataFinal || dataInicial <= dataFinal;
  const dentroDoPeriodo = (data: string) => (!dataInicial || data >= dataInicial) && (!dataFinal || data <= dataFinal);
  const movimentosFiltrados = useMemo(() => periodoValido ? movimentos.filter((movimento) => dentroDoPeriodo(movimento.data)) : [], [movimentos, dataInicial, dataFinal, periodoValido]);
  const vendasFiltradas = useMemo(() => periodoValido ? vendas.filter((venda) => dentroDoPeriodo(timestampParaIsoLocal(venda.criadoEm))) : [], [vendas, dataInicial, dataFinal, periodoValido]);
  const saldoPeriodo = useMemo(() => movimentosFiltrados.reduce((saldo, movimento) => saldo + (movimento.tipo === 'ENTRADA' ? Number(movimento.valor || 0) : -Number(movimento.valor || 0)), 0), [movimentosFiltrados]);
  const entradasPeriodo = useMemo(() => movimentosFiltrados.filter((m) => m.tipo === 'ENTRADA').reduce((s, m) => s + Number(m.valor || 0), 0), [movimentosFiltrados]);
  const vendasPeriodo = useMemo(() => vendasFiltradas.filter((v) => v.status === 'CONCLUIDA').length, [vendasFiltradas]);

  const abrirVenda = () => {
    if (fechamentoHoje) return showToast('O caixa de hoje já foi fechado.', 'error');
    setItens([]); setProdutoId(''); setQuantidade(1); setValorUnitario(0); setClienteId(''); setFormaPagamento('DINHEIRO'); setVencimento(hojeIso()); setObservacoes(''); setModalVenda(true);
  };

  const selecionarProduto = (id: string) => {
    setProdutoId(id);
    const produto = produtos.find((p) => p.id === id);
    setValorUnitario(Number(produto?.precoVenda || 0));
  };

  const adicionarItem = () => {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return showToast('Selecione um produto.', 'error');
    if (quantidade <= 0 || valorUnitario < 0) return showToast('Informe quantidade e valor válidos.', 'error');
    const existente = itens.find((item) => item.produtoId === produto.id);
    const novaQuantidade = Number(quantidade) + Number(existente?.quantidade || 0);
    if (novaQuantidade > Number(produto.estoqueAtual || 0)) return showToast(`Estoque insuficiente. Saldo atual: ${produto.estoqueAtual}.`, 'error');
    setItens((atuais) => [...atuais.filter((item) => item.produtoId !== produto.id), {
      id: existente?.id ?? `item-${Date.now()}`,
      produtoId: produto.id,
      produtoDescricao: produto.descricao,
      quantidade: novaQuantidade,
      valorUnitario: Number(valorUnitario),
      valorTotal: novaQuantidade * Number(valorUnitario),
    }]);
    setProdutoId(''); setQuantidade(1); setValorUnitario(0);
  };

  const concluirVenda = async () => {
    if (!usuario || !podeVender || itens.length === 0) return showToast('Adicione ao menos um produto.', 'error');
    const cliente = clientes.find((c) => c.id === clienteId);
    if (formaPagamento === 'CARTEIRA' && !cliente) return showToast('Selecione um cliente para venda em carteira.', 'error');
    setSalvando(true);
    try {
      await runTransaction(db, async (transaction) => {
        const fechamentoSnap = await transaction.get(empresaDoc(empresaId!, 'fechamentosCaixa', hojeIso()));
        if (fechamentoSnap.exists()) throw new Error('O caixa de hoje já foi fechado. Não é possível realizar novas vendas.');
        const contadorRef = empresaDoc(empresaId!, 'configuracoes', 'contadorVenda');
        const contadorSnap = await transaction.get(contadorRef);
        const numero = Number(contadorSnap.exists() ? contadorSnap.data().ultimoNumero ?? 0 : 0) + 1;
        const leiturasProdutos = [] as { item: ItemRascunho; ref: ReturnType<typeof empresaDoc>; produto: Produto }[];
        for (const item of itens) {
          const ref = empresaDoc(empresaId!, 'produtos', item.produtoId);
          const snap = await transaction.get(ref);
          if (!snap.exists()) throw new Error(`Produto “${item.produtoDescricao}” não encontrado.`);
          const produto = snap.data() as Produto;
          if (Number(produto.estoqueAtual || 0) < Number(item.quantidade)) throw new Error(`Estoque insuficiente para “${produto.descricao}”.`);
          leiturasProdutos.push({ item, ref, produto });
        }

        const vendaRef = doc(empresaCollection(empresaId!, 'vendas'));
        const movimentoRef = formaPagamento !== 'CARTEIRA' ? doc(empresaCollection(empresaId!, 'movimentacoesCaixa')) : null;
        const contaRef = formaPagamento === 'CARTEIRA' ? doc(empresaCollection(empresaId!, 'contasReceber')) : null;
        const registroFinanceiroRef = doc(empresaCollection(empresaId!, 'registrosFinanceiros'));

        transaction.set(contadorRef, { ultimoNumero: numero, atualizadoEm: serverTimestamp() }, { merge: true });
        for (const { item, ref, produto } of leiturasProdutos) {
          const saldoAnterior = Number(produto.estoqueAtual || 0);
          const saldoPosterior = saldoAnterior - Number(item.quantidade);
          transaction.update(ref, { estoqueAtual: saldoPosterior, atualizadoEm: serverTimestamp() });
          transaction.set(doc(empresaCollection(empresaId!, 'movimentacoesEstoque')), {
            produtoId: item.produtoId, produtoDescricao: item.produtoDescricao, tipo: 'SAIDA', quantidade: item.quantidade,
            saldoAnterior, saldoPosterior, motivo: `Venda #${String(numero).padStart(5, '0')}`, vendaId: vendaRef.id, vendaNumero: numero,
            usuarioId: usuario.id, usuarioNome: usuario.nome, criadoEm: serverTimestamp(),
          });
          transaction.set(doc(empresaSubcollection(empresaId!, 'vendas', vendaRef.id, 'itens')), {
            produtoId: item.produtoId, produtoDescricao: item.produtoDescricao, quantidade: item.quantidade,
            valorUnitario: item.valorUnitario, valorTotal: item.valorTotal, criadoEm: serverTimestamp(),
          });
        }

        if (movimentoRef) transaction.set(movimentoRef, {
          tipo: 'ENTRADA', origem: 'VENDA', origemId: vendaRef.id, origemNumero: numero,
          descricao: `Venda de produtos #${String(numero).padStart(5, '0')}`, clienteId: cliente?.id ?? '', clienteNome: cliente?.nome ?? 'Consumidor',
          valor: totalVenda, formaPagamento, data: hojeIso(), usuarioId: usuario.id, usuarioNome: usuario.nome, criadoEm: serverTimestamp(),
        });
        if (contaRef) transaction.set(contaRef, {
          clienteId: cliente!.id, clienteNome: cliente!.nome, vendaId: vendaRef.id, vendaNumero: numero,
          descricao: `Venda de produtos #${String(numero).padStart(5, '0')}`, valorOriginal: totalVenda, valorAberto: totalVenda,
          vencimento, status: 'ABERTA', observacoes: observacoes.trim(), registroFinanceiroId: registroFinanceiroRef.id, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
        transaction.set(registroFinanceiroRef, {
          tipo: formaPagamento === 'CARTEIRA' ? 'CONTAS_RECEBER' : 'RECEITA',
          origem: 'VENDA', origemId: vendaRef.id, origemNumero: numero,
          descricao: `Venda de produtos #${String(numero).padStart(5, '0')}`,
          clienteId: cliente?.id ?? '', clienteNome: cliente?.nome ?? 'Consumidor',
          valor: totalVenda, formaPagamento,
          status: formaPagamento === 'CARTEIRA' ? 'ABERTO' : 'RECEBIDO',
          vencimento: formaPagamento === 'CARTEIRA' ? vencimento : '',
          contaReceberId: contaRef?.id ?? '', movimentacaoCaixaId: movimentoRef?.id ?? '',
          data: hojeIso(), usuarioId: usuario.id, usuarioNome: usuario.nome,
          criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
        transaction.set(vendaRef, {
          numero, clienteId: cliente?.id ?? '', clienteNome: cliente?.nome ?? 'Consumidor', valorTotal: totalVenda,
          formaPagamento, status: 'CONCLUIDA', contaReceberId: contaRef?.id ?? '', movimentacaoCaixaId: movimentoRef?.id ?? '',
          observacoes: observacoes.trim(), registroFinanceiroId: registroFinanceiroRef.id, usuarioId: usuario.id, usuarioNome: usuario.nome, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
      });
      showToast(formaPagamento === 'CARTEIRA' ? 'Venda concluída e conta a receber criada.' : 'Venda concluída e entrada registrada no caixa.');
      setModalVenda(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível concluir a venda.', 'error');
    } finally { setSalvando(false); }
  };

  const fecharCaixaHoje = async () => {
    if (!usuario || !podeVender) return;
    if (fechamentoHoje) return showToast('O caixa de hoje já está fechado.', 'info');
    const data = hojeIso();
    if (!window.confirm(`Fechar o caixa de ${dataBr(data)}?\n\nDepois do fechamento, novas vendas, recebimentos e pagamentos ficarão bloqueados neste dia.`)) return;
    setFechandoCaixa(true);
    try {
      const snap = await getDocs(query(empresaCollection(empresaId!, 'movimentacoesCaixa'), where('data', '==', data)));
      const movimentosDoDia = snap.docs.map((documento) => documento.data() as MovimentacaoCaixa);
      const totalEntradas = movimentosDoDia.filter((movimento) => movimento.tipo === 'ENTRADA').reduce((soma, movimento) => soma + Number(movimento.valor || 0), 0);
      const totalSaidas = movimentosDoDia.filter((movimento) => movimento.tipo === 'SAIDA').reduce((soma, movimento) => soma + Number(movimento.valor || 0), 0);
      const fechamentoRef = empresaDoc(empresaId!, 'fechamentosCaixa', data);
      await runTransaction(db, async (transaction) => {
        const atual = await transaction.get(fechamentoRef);
        if (atual.exists()) throw new Error('O caixa de hoje já foi fechado por outro usuário.');
        transaction.set(fechamentoRef, {
          data,
          totalEntradas,
          totalSaidas,
          saldo: totalEntradas - totalSaidas,
          quantidadeMovimentacoes: movimentosDoDia.length,
          fechadoPorId: usuario.id,
          fechadoPorNome: usuario.nome,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
      });
      showToast('Caixa do dia fechado com sucesso.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível fechar o caixa.', 'error');
    } finally {
      setFechandoCaixa(false);
    }
  };

  const excluirMovimento = async (movimento: MovimentacaoCaixa) => {
    if (!podeExcluir) return showToast('Somente administradores podem excluir registros.', 'error');
    if (!window.confirm(`Excluir do caixa o registro “${movimento.descricao}” no valor de ${moeda(movimento.valor)}?\n\nEsta ação remove somente a movimentação exibida no caixa.`)) return;
    setExcluindoId(`movimento-${movimento.id}`);
    try {
      await excluirMovimentacaoCaixa(empresaId!, movimento.id);
      showToast('Registro do caixa excluído.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir o registro do caixa.', 'error');
    } finally {
      setExcluindoId(null);
    }
  };

  const excluirVendaRegistrada = async (venda: Venda) => {
    if (!podeExcluir) return showToast('Somente administradores podem excluir vendas.', 'error');
    if (!window.confirm(`Excluir definitivamente a venda #${String(venda.numero).padStart(5, '0')}?\n\nAs peças voltarão ao estoque e os registros financeiros vinculados também serão removidos. A numeração da venda não será reutilizada.`)) return;
    setExcluindoId(`venda-${venda.id}`);
    try {
      await excluirVenda(empresaId!, venda);
      showToast('Venda excluída e estoque restaurado.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir a venda.', 'error');
    } finally {
      setExcluindoId(null);
    }
  };

  return <>
    <section className="page-heading"><div><p className="eyebrow">CAIXA</p><h2>Fluxo de caixa e vendas</h2><p>Consulte períodos, acompanhe entradas e saídas e faça o fechamento diário.</p></div>{podeVender && <div className="button-group"><button className="button button-secondary" disabled={!!fechamentoHoje || fechandoCaixa} onClick={() => void fecharCaixaHoje()}>{fechamentoHoje ? <CheckCircle2 size={18}/> : <LockKeyhole size={18}/>} {fechamentoHoje ? 'Caixa de hoje fechado' : fechandoCaixa ? 'Fechando...' : 'Fechar caixa do dia'}</button><button className="button button-primary" disabled={!!fechamentoHoje} onClick={abrirVenda}><PlusCircle size={18}/>Nova venda</button></div>}</section>

    <section className="panel cash-period-panel"><div className="cash-period-filter"><div className="cash-period-title"><CalendarRange size={20}/><div><strong>Período do caixa</strong><span>Os totais e as listas abaixo seguem o período selecionado.</span></div></div><label className="field"><span>Data inicial</span><input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)}/></label><label className="field"><span>Data final</span><input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)}/></label><button className="button button-secondary" onClick={() => { setDataInicial(hojeIso()); setDataFinal(hojeIso()); }}>Hoje</button></div>{!periodoValido && <div className="period-error">A data inicial não pode ser posterior à data final.</div>}</section>

    <div className="stats-grid"><article className="stat-card"><div className="stat-icon teal"><Banknote size={21}/></div><div><span>Saldo do período</span><strong className="currency-stat">{moeda(saldoPeriodo)}</strong></div></article><article className="stat-card"><div className="stat-icon blue"><WalletCards size={21}/></div><div><span>Entradas do período</span><strong className="currency-stat">{moeda(entradasPeriodo)}</strong></div></article><article className="stat-card"><div className="stat-icon amber"><ShoppingCart size={21}/></div><div><span>Vendas do período</span><strong>{vendasPeriodo}</strong></div></article><article className="stat-card"><div className={`stat-icon ${fechamentoHoje ? 'teal' : 'rose'}`}>{fechamentoHoje ? <CheckCircle2 size={21}/> : <LockKeyhole size={21}/>}</div><div><span>Caixa de hoje</span><strong>{fechamentoHoje ? 'Fechado' : 'Aberto'}</strong>{fechamentoHoje && <small>Saldo: {moeda(fechamentoHoje.saldo)}</small>}</div></article></div>
    <div className="dashboard-columns finance-columns"><section className="panel"><div className="panel-header"><div><h3>Fluxo de caixa</h3><p>Somente valores efetivamente recebidos ou pagos</p></div></div><div className="table-wrap compact-table"><table><thead><tr><th>Data</th><th>Descrição</th><th>Forma</th><th>Valor</th>{podeExcluir && <th className="actions-column">Ações</th>}</tr></thead><tbody>{movimentosFiltrados.map((m) => <tr key={m.id}><td>{dataBr(m.data)}</td><td><strong>{m.descricao}</strong><small>{m.clienteNome || m.origem}</small></td><td>{m.formaPagamento}</td><td className={m.tipo === 'ENTRADA' ? 'value-positive' : 'value-negative'}>{m.tipo === 'ENTRADA' ? '+' : '-'} {moeda(m.valor)}</td>{podeExcluir && <td className="actions-cell"><button className="icon-button danger" title="Excluir registro do caixa" disabled={excluindoId === `movimento-${m.id}`} onClick={() => void excluirMovimento(m)}><Trash2 size={17}/></button></td>}</tr>)}{movimentosFiltrados.length === 0 && <tr><td colSpan={podeExcluir ? 5 : 4}><div className="empty-state compact">Nenhuma movimentação no período.</div></td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-header"><div><h3>Vendas de produtos</h3><p>Histórico das vendas realizadas no período</p></div></div><div className="table-wrap compact-table"><table><thead><tr><th>Venda</th><th>Cliente</th><th>Pagamento</th><th>Total</th>{podeExcluir && <th className="actions-column">Ações</th>}</tr></thead><tbody>{vendasFiltradas.map((v) => <tr key={v.id}><td>#{String(v.numero).padStart(5,'0')}</td><td>{v.clienteNome}</td><td>{v.formaPagamento}</td><td>{moeda(v.valorTotal)}</td>{podeExcluir && <td className="actions-cell"><button className="icon-button danger" title="Excluir venda" disabled={excluindoId === `venda-${v.id}`} onClick={() => void excluirVendaRegistrada(v)}><Trash2 size={17}/></button></td>}</tr>)}{vendasFiltradas.length === 0 && <tr><td colSpan={podeExcluir ? 5 : 4}><div className="empty-state compact">Nenhuma venda no período.</div></td></tr>}</tbody></table></div></section></div>

    <Modal aberto={modalVenda} aoFechar={() => setModalVenda(false)} titulo="Nova venda de produtos" largura="xl" classe="modal-venda"><div className="form-stack"><div className="add-item-form add-item-form-6"><select value={produtoId} onChange={(e) => selecionarProduto(e.target.value)}><option value="">Selecione o produto</option>{produtos.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.descricao} — estoque {p.estoqueAtual}</option>)}</select><input type="number" min="1" step="1" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 0))}/><input type="number" min="0" step="0.01" value={valorUnitario} onChange={(e) => setValorUnitario(Number(e.target.value || 0))}/><button className="button button-secondary" onClick={adicionarItem}>Adicionar</button></div>
    <div className="table-wrap compact-table"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th><th></th></tr></thead><tbody>{itens.map((item) => <tr key={item.id}><td>{item.produtoDescricao}</td><td>{item.quantidade}</td><td>{moeda(item.valorUnitario)}</td><td>{moeda(item.valorTotal)}</td><td><button className="icon-button" onClick={() => setItens((atuais) => atuais.filter((i) => i.id !== item.id))}><Trash2 size={16}/></button></td></tr>)}{itens.length === 0 && <tr><td colSpan={5}><div className="empty-state compact">Adicione os produtos da venda.</div></td></tr>}</tbody></table></div>
    <div className="sale-total"><span>Total da venda</span><strong>{moeda(totalVenda)}</strong></div>
    <div className="form-grid"><label className="field field-full"><span>Cliente {formaPagamento === 'CARTEIRA' ? '*' : '(opcional)'}</span><select value={clienteId} onChange={(e) => setClienteId(e.target.value)}><option value="">Consumidor</option>{clientes.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label><label className="field"><span>Forma de pagamento</span><select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamentoVenda)}>{formas.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>{formaPagamento === 'CARTEIRA' && <label className="field"><span>Vencimento</span><input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)}/></label>}<label className="field field-full"><span>Observações</span><textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}/></label></div>
    <div className="modal-actions"><button className="button button-secondary" onClick={() => setModalVenda(false)}>Cancelar</button><button className="button button-primary" disabled={salvando || itens.length === 0} onClick={() => void concluirVenda()}>{salvando ? 'Concluindo...' : 'Concluir venda'}</button></div></div></Modal>
  </>;
}
