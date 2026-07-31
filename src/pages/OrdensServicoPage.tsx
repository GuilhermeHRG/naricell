import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { CheckCircle2, Edit3, FileDown, PackagePlus, PlusCircle, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { PatternLockInput } from '../components/PatternLockInput';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { empresaCollection, empresaDoc, empresaSubcollection } from '../lib/tenant';
import { gerarPdfOrdemServico } from '../lib/pdf';
import { dataHoraBr, moeda, normalizarTexto, statusLabel } from '../lib/utils';
import type {
  Cliente,
  ConfiguracaoEmpresa,
  OrdemServico,
  OrdemServicoItem,
  Produto,
  Servico,
  StatusOS,
  TipoBloqueio,
  Usuario,
} from '../types';

const statusDisponiveis: StatusOS[] = ['ABERTA', 'AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_PECA', 'EM_MANUTENCAO', 'PRONTA_PARA_RETIRADA', 'ENTREGUE', 'CANCELADA', 'SEM_CONSERTO'];
const tiposBloqueio: { value: TipoBloqueio; label: string }[] = [
  { value: 'NENHUM', label: 'Sem bloqueio' },
  { value: 'PIN', label: 'PIN / numérica' },
  { value: 'SENHA', label: 'Senha / texto' },
  { value: 'PADRAO', label: 'Padrão de desenho' },
];
const empresaPadrao: ConfiguracaoEmpresa = { nomeFantasia: 'NariCell Assistência Técnica', garantiaPadraoDias: 90, logoUrl: '/logo-naricell.jpg' };

const formVazio = {
  clienteId: '',
  aparelhoMarca: '',
  aparelhoModelo: '',
  aparelhoImei: '',
  aparelhoCor: '',
  acessorios: '',
  defeitoRelatado: '',
  diagnostico: '',
  status: 'ABERTA' as StatusOS,
  tecnicoId: '',
  previsaoEntrega: '',
  desconto: 0,
  garantiaDias: 90,
  observacoesInternas: '',
  tipoBloqueio: 'NENHUM' as TipoBloqueio,
  codigoBloqueio: '',
  padraoBloqueio: [] as number[],
};
type FormOS = typeof formVazio;
type TotaisOS = Pick<OrdemServico, 'valorServicos' | 'valorProdutos' | 'valorTotal'>;

function calcularTotais(itens: OrdemServicoItem[], desconto: number): TotaisOS {
  const valorServicos = itens
    .filter((item) => item.tipo === 'SERVICO')
    .reduce((soma, item) => soma + Number(item.valorTotal || 0), 0);
  const valorProdutos = itens
    .filter((item) => item.tipo === 'PRODUTO')
    .reduce((soma, item) => soma + Number(item.valorTotal || 0), 0);
  return {
    valorServicos,
    valorProdutos,
    valorTotal: Math.max(0, valorServicos + valorProdutos - Number(desconto || 0)),
  };
}

function temDiferencaDeTotais(ordem: OrdemServico, totais: TotaisOS) {
  return Math.abs(Number(ordem.valorServicos || 0) - totais.valorServicos) > 0.001
    || Math.abs(Number(ordem.valorProdutos || 0) - totais.valorProdutos) > 0.001
    || Math.abs(Number(ordem.valorTotal || 0) - totais.valorTotal) > 0.001;
}

export function OrdensServicoPage() {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa>(empresaPadrao);
  const [busca, setBusca] = useState('');
  const [modalForm, setModalForm] = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState(false);
  const [edicao, setEdicao] = useState<OrdemServico | null>(null);
  const [selecionada, setSelecionada] = useState<OrdemServico | null>(null);
  const [itens, setItens] = useState<OrdemServicoItem[]>([]);
  const [itensCarregados, setItensCarregados] = useState(false);
  const [itensFormulario, setItensFormulario] = useState<OrdemServicoItem[]>([]);
  const [carregandoItensFormulario, setCarregandoItensFormulario] = useState(false);
  const [form, setForm] = useState<FormOS>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [tipoItem, setTipoItem] = useState<'PRODUTO' | 'SERVICO'>('SERVICO');
  const [referenciaItem, setReferenciaItem] = useState('');
  const [quantidadeItem, setQuantidadeItem] = useState(1);
  const [valorItem, setValorItem] = useState(0);
  const [adicionandoItem, setAdicionandoItem] = useState(false);
  const [tipoItemFormulario, setTipoItemFormulario] = useState<'PRODUTO' | 'SERVICO'>('SERVICO');
  const [referenciaItemFormulario, setReferenciaItemFormulario] = useState('');
  const [quantidadeItemFormulario, setQuantidadeItemFormulario] = useState(1);
  const [valorItemFormulario, setValorItemFormulario] = useState(0);
  const { usuario, empresaId } = useAuth();
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId!, 'ordensServico'), orderBy('criadoEm', 'desc')), (snap) => setOrdens(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrdemServico))), () => showToast('Não foi possível carregar as ordens.', 'error')),
    [showToast, empresaId],
  );
  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId!, 'clientes'), orderBy('nome')), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente))), () => showToast('Não foi possível carregar os clientes.', 'error')),
    [showToast, empresaId],
  );
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'produtos'), orderBy('descricao')), (snap) => setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto))), () => undefined), [empresaId]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'servicos'), orderBy('descricao')), (snap) => setServicos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Servico))), () => undefined), [empresaId]);
  useEffect(() => onSnapshot(query(empresaCollection(empresaId!, 'usuarios'), orderBy('nome')), (snap) => setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Usuario))), () => undefined), [empresaId]);
  useEffect(() => onSnapshot(empresaDoc(empresaId!, 'configuracoes', 'empresa'), (snap) => { if (snap.exists()) setEmpresa({ ...empresaPadrao, ...(snap.data() as ConfiguracaoEmpresa) }); }, () => undefined), [empresaId]);

  useEffect(() => {
    if (!selecionada) return undefined;
    setItensCarregados(false);
    return onSnapshot(
      query(empresaSubcollection(empresaId!, 'ordensServico', selecionada.id, 'itens'), orderBy('criadoEm')),
      (snap) => {
        setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrdemServicoItem)));
        setItensCarregados(true);
      },
      () => setItensCarregados(true),
    );
  }, [selecionada?.id, empresaId]);

  useEffect(() => {
    if (!selecionada) return;
    const atualizada = ordens.find((item) => item.id === selecionada.id);
    if (atualizada) setSelecionada((anterior) => (anterior ? { ...anterior, ...atualizada } : anterior));
  }, [ordens, selecionada?.id]);

  const totaisSelecionada = useMemo(() => selecionada ? calcularTotais(itens, selecionada.desconto) : { valorServicos: 0, valorProdutos: 0, valorTotal: 0 }, [itens, selecionada?.desconto]);

  // Corrige automaticamente OS antigas que tiveram itens gravados, mas ficaram com os totais zerados.
  useEffect(() => {
    if (!selecionada || !itensCarregados) return;
    if (!temDiferencaDeTotais(selecionada, totaisSelecionada)) return;
    void updateDoc(empresaDoc(empresaId!, 'ordensServico', selecionada.id), { ...totaisSelecionada, atualizadoEm: serverTimestamp() })
      .then(() => setSelecionada((atual) => atual ? { ...atual, ...totaisSelecionada } : atual))
      .catch(() => undefined);
  }, [selecionada?.id, selecionada?.desconto, itensCarregados, empresaId, totaisSelecionada.valorServicos, totaisSelecionada.valorProdutos, totaisSelecionada.valorTotal]);

  const filtradas = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!termo) return ordens;
    return ordens.filter((os) => normalizarTexto(`${os.numero} ${os.clienteNome} ${os.aparelhoMarca} ${os.aparelhoModelo} ${os.status}`).includes(termo));
  }, [busca, ordens]);

  const tecnicoSelecionado = usuarios.find((u) => u.id === form.tecnicoId);
  const clienteSelecionado = clientes.find((c) => c.id === form.clienteId);
  const listaItensDisponiveis = tipoItem === 'PRODUTO' ? produtos.filter((p) => p.ativo) : servicos.filter((s) => s.ativo);
  const listaItensFormulario = tipoItemFormulario === 'PRODUTO' ? produtos.filter((p) => p.ativo) : servicos.filter((s) => s.ativo);
  const totaisFormulario = useMemo(() => {
    if (edicao && carregandoItensFormulario) {
      return { valorServicos: edicao.valorServicos || 0, valorProdutos: edicao.valorProdutos || 0, valorTotal: edicao.valorTotal || 0 };
    }
    return calcularTotais(itensFormulario, form.desconto);
  }, [edicao?.id, edicao?.valorServicos, edicao?.valorProdutos, edicao?.valorTotal, carregandoItensFormulario, itensFormulario, form.desconto]);

  const abrirNova = () => {
    setEdicao(null);
    setForm({ ...formVazio, garantiaDias: empresa.garantiaPadraoDias || 90 });
    setItensFormulario([]);
    setCarregandoItensFormulario(false);
    setTipoItemFormulario('SERVICO');
    setReferenciaItemFormulario('');
    setQuantidadeItemFormulario(1);
    setValorItemFormulario(0);
    setModalForm(true);
  };

  const abrirEdicao = (os: OrdemServico) => {
    setEdicao(os);
    setForm({
      clienteId: os.clienteId,
      aparelhoMarca: os.aparelhoMarca,
      aparelhoModelo: os.aparelhoModelo,
      aparelhoImei: os.aparelhoImei ?? '',
      aparelhoCor: os.aparelhoCor ?? '',
      acessorios: os.acessorios ?? '',
      defeitoRelatado: os.defeitoRelatado,
      diagnostico: os.diagnostico ?? '',
      status: os.status,
      tecnicoId: os.tecnicoId ?? '',
      previsaoEntrega: os.previsaoEntrega ?? '',
      desconto: os.desconto,
      garantiaDias: os.garantiaDias,
      observacoesInternas: os.observacoesInternas ?? '',
      tipoBloqueio: os.tipoBloqueio ?? 'NENHUM',
      codigoBloqueio: os.codigoBloqueio ?? '',
      padraoBloqueio: os.padraoBloqueio ?? [],
    });
    setItensFormulario([]);
    setCarregandoItensFormulario(true);
    setModalForm(true);
    void getDocs(query(empresaSubcollection(empresaId!, 'ordensServico', os.id, 'itens'), orderBy('criadoEm')))
      .then((snap) => {
        const itensDaOrdem = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrdemServicoItem));
        setItensFormulario(itensDaOrdem);
      })
      .catch(() => showToast('Não foi possível carregar os itens desta OS.', 'error'))
      .finally(() => setCarregandoItensFormulario(false));
  };

  const abrirDetalhe = (os: OrdemServico) => {
    setSelecionada(os);
    setItens([]);
    setItensCarregados(false);
    setModalDetalhe(true);
  };

  const atualizarSelecionada = (id: string, patch: Partial<OrdemServico>) => {
    setSelecionada((atual) => (atual?.id === id ? { ...atual, ...patch } : atual));
  };

  const mudarReferencia = (id: string) => {
    setReferenciaItem(id);
    const origem = tipoItem === 'PRODUTO' ? produtos.find((p) => p.id === id) : servicos.find((s) => s.id === id);
    setValorItem(origem ? (tipoItem === 'PRODUTO' ? (origem as Produto).precoVenda : (origem as Servico).precoPadrao) : 0);
  };

  const mudarReferenciaFormulario = (id: string) => {
    setReferenciaItemFormulario(id);
    const origem = tipoItemFormulario === 'PRODUTO' ? produtos.find((p) => p.id === id) : servicos.find((s) => s.id === id);
    setValorItemFormulario(origem ? (tipoItemFormulario === 'PRODUTO' ? (origem as Produto).precoVenda : (origem as Servico).precoPadrao) : 0);
  };

  const adicionarItemAoRascunho = () => {
    if (!referenciaItemFormulario) return showToast('Selecione um produto ou serviço para incluir.', 'error');
    if (quantidadeItemFormulario <= 0 || valorItemFormulario < 0) return showToast('Informe quantidade e valor válidos.', 'error');
    const origem = tipoItemFormulario === 'PRODUTO'
      ? produtos.find((p) => p.id === referenciaItemFormulario)
      : servicos.find((s) => s.id === referenciaItemFormulario);
    if (!origem) return showToast('O item selecionado não foi encontrado.', 'error');
    const item: OrdemServicoItem = {
      id: `rascunho-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tipo: tipoItemFormulario,
      produtoId: tipoItemFormulario === 'PRODUTO' ? origem.id : '',
      servicoId: tipoItemFormulario === 'SERVICO' ? origem.id : '',
      descricao: origem.descricao,
      quantidade: Number(quantidadeItemFormulario),
      valorUnitario: Number(valorItemFormulario),
      valorTotal: Number(quantidadeItemFormulario) * Number(valorItemFormulario),
    };
    setItensFormulario((atual) => [...atual, item]);
    setReferenciaItemFormulario('');
    setQuantidadeItemFormulario(1);
    setValorItemFormulario(0);
  };

  const salvarOS = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!clienteSelecionado) return showToast('Selecione um cliente.', 'error');
    if (!usuario) return;
    if (edicao && carregandoItensFormulario) return showToast('Aguarde o carregamento dos itens antes de salvar.', 'info');
    setSalvando(true);

    try {
      const totais = calcularTotais(itensFormulario, form.desconto);
      const dadosBase = {
        clienteId: clienteSelecionado.id,
        clienteNome: clienteSelecionado.nome,
        aparelhoMarca: form.aparelhoMarca.trim(),
        aparelhoModelo: form.aparelhoModelo.trim(),
        aparelhoImei: form.aparelhoImei.trim(),
        aparelhoCor: form.aparelhoCor.trim(),
        acessorios: form.acessorios.trim(),
        defeitoRelatado: form.defeitoRelatado.trim(),
        diagnostico: form.diagnostico.trim(),
        status: form.status,
        tecnicoId: tecnicoSelecionado?.id ?? '',
        tecnicoNome: tecnicoSelecionado?.nome ?? '',
        previsaoEntrega: form.previsaoEntrega || '',
        desconto: Number(form.desconto || 0),
        garantiaDias: Number(form.garantiaDias || 0),
        observacoesInternas: form.observacoesInternas.trim(),
        tipoBloqueio: form.tipoBloqueio,
        codigoBloqueio: form.tipoBloqueio === 'PADRAO' ? '' : form.codigoBloqueio.trim(),
        padraoBloqueio: form.tipoBloqueio === 'PADRAO' ? form.padraoBloqueio : [],
        ...totais,
        atualizadoEm: serverTimestamp(),
      };

      if (edicao) {
        await updateDoc(empresaDoc(empresaId!, 'ordensServico', edicao.id), dadosBase);
        if (selecionada?.id === edicao.id) atualizarSelecionada(edicao.id, dadosBase as Partial<OrdemServico>);
        showToast('Ordem de serviço atualizada.');
        setModalForm(false);
        return;
      }

      let nova: OrdemServico | null = null;
      await runTransaction(db, async (transaction) => {
        const contadorRef = empresaDoc(empresaId!, 'configuracoes', 'contadorOS');
        const contadorSnap = await transaction.get(contadorRef);
        const numeroOS = Number(contadorSnap.exists() ? contadorSnap.data().ultimoNumero ?? 0 : 0) + 1;
        const osRef = doc(empresaCollection(empresaId!, 'ordensServico'));
        transaction.set(contadorRef, { ultimoNumero: numeroOS, atualizadoEm: serverTimestamp() }, { merge: true });
        transaction.set(osRef, {
          ...dadosBase,
          numero: numeroOS,
          estoqueBaixado: false,
          criadoPor: usuario.id,
          criadoEm: serverTimestamp(),
        });
        itensFormulario.forEach((item) => {
          transaction.set(doc(empresaSubcollection(empresaId!, 'ordensServico', osRef.id, 'itens')), {
            tipo: item.tipo,
            produtoId: item.produtoId || '',
            servicoId: item.servicoId || '',
            descricao: item.descricao,
            quantidade: Number(item.quantidade),
            valorUnitario: Number(item.valorUnitario),
            valorTotal: Number(item.valorTotal),
            criadoEm: serverTimestamp(),
          });
        });
        transaction.set(doc(empresaSubcollection(empresaId!, 'ordensServico', osRef.id, 'historico')), {
          descricao: `Ordem de serviço criada${itensFormulario.length ? ` com ${itensFormulario.length} item(ns)` : ''}.`,
          usuarioNome: usuario.nome,
          criadoEm: serverTimestamp(),
        });
        nova = {
          id: osRef.id,
          ...dadosBase,
          numero: numeroOS,
          estoqueBaixado: false,
          criadoPor: usuario.id,
        } as OrdemServico;
      });
      showToast('OS criada com os valores calculados.');
      setModalForm(false);
      if (nova) abrirDetalhe(nova);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar a OS.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarItem = async () => {
    if (!selecionada || !referenciaItem) return showToast('Selecione um produto ou serviço.', 'error');
    if (quantidadeItem <= 0 || valorItem < 0) return showToast('Informe quantidade e valor válidos.', 'error');
    if (selecionada.estoqueBaixado) return showToast('A OS já foi concluída e não aceita novos itens.', 'error');
    setAdicionandoItem(true);
    try {
      const origem = tipoItem === 'PRODUTO' ? produtos.find((p) => p.id === referenciaItem) : servicos.find((s) => s.id === referenciaItem);
      if (!origem) throw new Error('Item não encontrado.');
      const valorTotalItem = Number(quantidadeItem) * Number(valorItem);
      const osRef = empresaDoc(empresaId!, 'ordensServico', selecionada.id);
      await runTransaction(db, async (transaction) => {
        const osSnap = await transaction.get(osRef);
        if (!osSnap.exists()) throw new Error('OS não encontrada.');
        const osAtual = { id: osSnap.id, ...osSnap.data() } as OrdemServico;
        if (osAtual.estoqueBaixado) throw new Error('A OS já foi concluída e não aceita novos itens.');
        const proximoServico = Number(osAtual.valorServicos || 0) + (tipoItem === 'SERVICO' ? valorTotalItem : 0);
        const proximoProduto = Number(osAtual.valorProdutos || 0) + (tipoItem === 'PRODUTO' ? valorTotalItem : 0);
        const proximoTotal = Math.max(0, proximoServico + proximoProduto - Number(osAtual.desconto || 0));
        transaction.set(doc(empresaSubcollection(empresaId!, 'ordensServico', selecionada.id, 'itens')), {
          tipo: tipoItem,
          produtoId: tipoItem === 'PRODUTO' ? referenciaItem : '',
          servicoId: tipoItem === 'SERVICO' ? referenciaItem : '',
          descricao: origem.descricao,
          quantidade: Number(quantidadeItem),
          valorUnitario: Number(valorItem),
          valorTotal: valorTotalItem,
          criadoEm: serverTimestamp(),
        });
        transaction.update(osRef, {
          valorServicos: proximoServico,
          valorProdutos: proximoProduto,
          valorTotal: proximoTotal,
          atualizadoEm: serverTimestamp(),
        });
      });
      const totaisLocais = calcularTotais([
        ...itens,
        {
          id: `local-${Date.now()}`,
          tipo: tipoItem,
          produtoId: tipoItem === 'PRODUTO' ? referenciaItem : '',
          servicoId: tipoItem === 'SERVICO' ? referenciaItem : '',
          descricao: origem.descricao,
          quantidade: Number(quantidadeItem),
          valorUnitario: Number(valorItem),
          valorTotal: valorTotalItem,
        },
      ], selecionada.desconto);
      atualizarSelecionada(selecionada.id, totaisLocais);
      setReferenciaItem('');
      setQuantidadeItem(1);
      setValorItem(0);
      showToast('Item adicionado e total da OS atualizado.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível adicionar o item.', 'error');
    } finally {
      setAdicionandoItem(false);
    }
  };

  const concluirOS = async () => {
    if (!selecionada || !usuario) return;
    if (selecionada.estoqueBaixado) return showToast('As peças desta OS já foram baixadas.', 'info');
    const itensProduto = itens.filter((item) => item.tipo === 'PRODUTO');
    if (!window.confirm(`Concluir a OS #${String(selecionada.numero).padStart(5, '0')}? ${itensProduto.length} item(ns) de produto terão baixa definitiva no estoque.`)) return;
    try {
      await runTransaction(db, async (transaction) => {
        const osRef = empresaDoc(empresaId!, 'ordensServico', selecionada.id);
        const osSnap = await transaction.get(osRef);
        if (!osSnap.exists()) throw new Error('OS não encontrada.');
        if (osSnap.data().estoqueBaixado) throw new Error('Esta OS já foi concluída por outro usuário.');

        for (const item of itensProduto) {
          if (!item.produtoId) continue;
          const produtoRef = empresaDoc(empresaId!, 'produtos', item.produtoId);
          const produtoSnap = await transaction.get(produtoRef);
          if (!produtoSnap.exists()) throw new Error(`Produto “${item.descricao}” não encontrado.`);
          const produto = produtoSnap.data() as Produto;
          const anterior = Number(produto.estoqueAtual || 0);
          const posterior = anterior - Number(item.quantidade || 0);
          if (posterior < 0) throw new Error(`Estoque insuficiente para “${produto.descricao}”. Saldo: ${anterior}.`);
          transaction.update(produtoRef, { estoqueAtual: posterior, atualizadoEm: serverTimestamp() });
          transaction.set(doc(empresaCollection(empresaId!, 'movimentacoesEstoque')), {
            produtoId: produtoRef.id,
            produtoDescricao: produto.descricao,
            tipo: 'SAIDA',
            quantidade: item.quantidade,
            saldoAnterior: anterior,
            saldoPosterior: posterior,
            motivo: `Peça utilizada na OS #${String(selecionada.numero).padStart(5, '0')}`,
            ordemServicoId: selecionada.id,
            ordemServicoNumero: selecionada.numero,
            usuarioId: usuario.id,
            usuarioNome: usuario.nome,
            criadoEm: serverTimestamp(),
          });
        }
        transaction.update(osRef, { estoqueBaixado: true, status: 'PRONTA_PARA_RETIRADA', atualizadoEm: serverTimestamp() });
        transaction.set(doc(empresaSubcollection(empresaId!, 'ordensServico', selecionada.id, 'historico')), { descricao: 'OS concluída; peças baixadas do estoque.', usuarioNome: usuario.nome, criadoEm: serverTimestamp() });
      });
      atualizarSelecionada(selecionada.id, { estoqueBaixado: true, status: 'PRONTA_PARA_RETIRADA' });
      showToast('OS concluída e estoque atualizado.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível concluir a OS.', 'error');
    }
  };

  const gerarPDF = async () => {
    if (!selecionada) return;
    try {
      const clienteSnap = await getDoc(empresaDoc(empresaId!, 'clientes', selecionada.clienteId));
      await gerarPdfOrdemServico(
        { ...selecionada, ...totaisSelecionada },
        clienteSnap.exists() ? ({ id: clienteSnap.id, ...clienteSnap.data() } as Cliente) : undefined,
        itens,
        empresa,
      );
    } catch {
      showToast('Não foi possível gerar o PDF.', 'error');
    }
  };

  const totalParcialItem = quantidadeItem * valorItem;
  const totalParcialFormulario = quantidadeItemFormulario * valorItemFormulario;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">ATENDIMENTO TÉCNICO</p>
          <h2>Ordens de serviço</h2>
          <p>Abra a OS já com as peças e serviços. O total é calculado no lançamento, na edição e no PDF.</p>
        </div>
        <button className="button button-primary" onClick={abrirNova}><PlusCircle size={18} />Nova OS</button>
      </section>

      <section className="panel">
        <div className="toolbar">
          <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por OS, cliente, aparelho ou status" /></label>
          <span className="result-count">{filtradas.length} ordem(ns)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>OS</th><th>Cliente / aparelho</th><th>Status</th><th>Total</th><th>Criada em</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {filtradas.map((os) => (
                <tr key={os.id} className="click-row" onDoubleClick={() => abrirDetalhe(os)}>
                  <td className="code-cell">#{String(os.numero).padStart(5, '0')}</td>
                  <td><strong>{os.clienteNome}</strong><small>{os.aparelhoMarca} {os.aparelhoModelo}</small></td>
                  <td><span className={`status status-${os.status.toLowerCase()}`}>{statusLabel(os.status)}</span></td>
                  <td>{moeda(os.valorTotal)}</td>
                  <td>{dataHoraBr(os.criadoEm)}</td>
                  <td className="actions-cell"><button className="button button-small" onClick={() => abrirDetalhe(os)}>Abrir</button><button className="icon-button" title="Editar" onClick={() => abrirEdicao(os)}><Edit3 size={17} /></button></td>
                </tr>
              ))}
              {filtradas.length === 0 && <tr><td colSpan={6}><div className="empty-state">Nenhuma ordem de serviço encontrada.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modalForm} aoFechar={() => setModalForm(false)} titulo={edicao ? `Editar OS #${String(edicao.numero).padStart(5, '0')}` : 'Nova ordem de serviço'} largura="xl">
        <form className="form-grid" onSubmit={salvarOS}>
          <label className="field field-span-2">
            <span>Cliente *</span>
            <select required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Selecione o cliente</option>
              {clientes.filter((c) => c.ativo).map((cliente) => <option value={cliente.id} key={cliente.id}>{cliente.nome}</option>)}
            </select>
          </label>
          <label className="field"><span>Técnico responsável</span><select value={form.tecnicoId} onChange={(e) => setForm({ ...form, tecnicoId: e.target.value })}><option value="">Não definido</option>{usuarios.filter((u) => u.ativo && ['ADMIN', 'TECNICO'].includes(u.perfil)).map((u) => <option value={u.id} key={u.id}>{u.nome}</option>)}</select></label>
          <label className="field"><span>Previsão de entrega</span><input type="date" value={form.previsaoEntrega} onChange={(e) => setForm({ ...form, previsaoEntrega: e.target.value })} /></label>
          <label className="field"><span>Marca *</span><input required value={form.aparelhoMarca} onChange={(e) => setForm({ ...form, aparelhoMarca: e.target.value })} placeholder="Ex.: Samsung" /></label>
          <label className="field"><span>Modelo *</span><input required value={form.aparelhoModelo} onChange={(e) => setForm({ ...form, aparelhoModelo: e.target.value })} placeholder="Ex.: Redmi Note 11 Pro" /></label>
          <label className="field"><span>IMEI</span><input value={form.aparelhoImei} onChange={(e) => setForm({ ...form, aparelhoImei: e.target.value })} /></label>
          <label className="field"><span>Cor</span><input value={form.aparelhoCor} onChange={(e) => setForm({ ...form, aparelhoCor: e.target.value })} /></label>
          <label className="field field-span-2"><span>Acessórios entregues</span><input value={form.acessorios} onChange={(e) => setForm({ ...form, acessorios: e.target.value })} placeholder="Ex.: carregador, chip, capinha" /></label>
          <label className="field field-full"><span>Defeito relatado *</span><textarea required rows={3} value={form.defeitoRelatado} onChange={(e) => setForm({ ...form, defeitoRelatado: e.target.value })} /></label>
          <label className="field"><span>Bloqueio do aparelho</span><select value={form.tipoBloqueio} onChange={(e) => setForm({ ...form, tipoBloqueio: e.target.value as TipoBloqueio, codigoBloqueio: '', padraoBloqueio: [] })}>{tiposBloqueio.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}</select></label>
          {form.tipoBloqueio !== 'PADRAO' && form.tipoBloqueio !== 'NENHUM' && <label className="field"><span>{form.tipoBloqueio === 'PIN' ? 'PIN / código' : 'Senha'}</span><input value={form.codigoBloqueio} onChange={(e) => setForm({ ...form, codigoBloqueio: e.target.value })} /></label>}
          {form.tipoBloqueio === 'PADRAO' && <div className="field field-span-2"><span>Padrão de desbloqueio</span><PatternLockInput value={form.padraoBloqueio} onChange={(padraoBloqueio) => setForm({ ...form, padraoBloqueio })} /><small>No PDF também sai a grade com os pontos, permitindo complementar à caneta se necessário.</small></div>}

          <section className="embedded-panel field-full form-itens-panel">
            <div className="panel-header">
              <div><h3>{edicao ? 'Itens já lançados' : 'Itens da OS'}</h3><p>{edicao ? 'Os valores abaixo são recalculados a partir dos itens gravados.' : 'Adicione serviços e peças antes de criar a OS para ela já nascer com o total correto.'}</p></div>
            </div>
            {edicao && carregandoItensFormulario ? <div className="empty-state compact">Carregando itens e valores...</div> : <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th>{!edicao && <th />}</tr></thead>
                  <tbody>
                    {itensFormulario.map((item) => <tr key={item.id}><td><span className="badge badge-muted">{item.tipo === 'PRODUTO' ? 'Produto' : 'Serviço'}</span></td><td>{item.descricao}</td><td>{item.quantidade}</td><td>{moeda(item.valorUnitario)}</td><td>{moeda(item.valorTotal)}</td>{!edicao && <td className="actions-cell"><button type="button" className="icon-button danger" title="Remover item" onClick={() => setItensFormulario((atual) => atual.filter((atualItem) => atualItem.id !== item.id))}><Trash2 size={16} /></button></td>}</tr>)}
                    {itensFormulario.length === 0 && <tr><td colSpan={edicao ? 5 : 6}><div className="empty-state compact">Nenhum item lançado.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              {!edicao && <div className="add-item-form add-item-form-6 form-add-item"><select value={tipoItemFormulario} onChange={(e) => { setTipoItemFormulario(e.target.value as typeof tipoItemFormulario); setReferenciaItemFormulario(''); setValorItemFormulario(0); }}><option value="SERVICO">Serviço</option><option value="PRODUTO">Produto</option></select><select value={referenciaItemFormulario} onChange={(e) => mudarReferenciaFormulario(e.target.value)}><option value="">Selecione</option>{listaItensFormulario.map((item) => <option value={item.id} key={item.id}>{item.descricao}{tipoItemFormulario === 'PRODUTO' ? ` — estoque ${(item as Produto).estoqueAtual}` : ''}</option>)}</select><input type="number" min="0.01" step="0.01" value={quantidadeItemFormulario} onChange={(e) => setQuantidadeItemFormulario(Number(e.target.value || 0))} title="Quantidade" /><input type="number" min="0" step="0.01" value={valorItemFormulario} onChange={(e) => setValorItemFormulario(Number(e.target.value || 0))} title="Valor unitário" /><div className="item-total-box"><span>Parcial</span><strong>{moeda(totalParcialFormulario)}</strong></div><button type="button" className="button button-secondary" onClick={adicionarItemAoRascunho}><PackagePlus size={16} />Incluir item</button></div>}
            </>}
          </section>

          <label className="field"><span>Desconto (R$)</span><input min="0" step="0.01" type="number" value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value || 0) })} /></label>
          <label className="field"><span>Garantia em dias</span><input min="0" type="number" value={form.garantiaDias} onChange={(e) => setForm({ ...form, garantiaDias: Number(e.target.value || 0) })} /></label>
          <div className="field field-span-2 form-total-card"><span>Total da ordem de serviço</span><strong>{moeda(totaisFormulario.valorTotal)}</strong><small>Serviços: {moeda(totaisFormulario.valorServicos)} · Peças: {moeda(totaisFormulario.valorProdutos)} · Desconto: {moeda(form.desconto)}</small></div>

          {edicao && <>
            <label className="field"><span>Status</span><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StatusOS })}>{statusDisponiveis.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="field field-full"><span>Diagnóstico técnico</span><textarea rows={3} value={form.diagnostico} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} /></label>
            <label className="field field-full"><span>Observações internas</span><textarea rows={2} value={form.observacoesInternas} onChange={(e) => setForm({ ...form, observacoesInternas: e.target.value })} /></label>
          </>}

          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModalForm(false)}>Cancelar</button><button className="button button-primary" disabled={salvando || carregandoItensFormulario}>{salvando ? 'Salvando...' : edicao ? 'Atualizar OS' : 'Criar OS'}</button></div>
        </form>
      </Modal>

      <Modal aberto={modalDetalhe} aoFechar={() => setModalDetalhe(false)} titulo={selecionada ? `OS #${String(selecionada.numero).padStart(5, '0')} — ${selecionada.clienteNome}` : 'Ordem de serviço'} largura="xl">
        {selecionada && <div className="os-detail">
          <div className="os-detail-header"><div><span className={`status status-${selecionada.status.toLowerCase()}`}>{statusLabel(selecionada.status)}</span><h3>{selecionada.aparelhoMarca} {selecionada.aparelhoModelo}</h3><p>Defeito: {selecionada.defeitoRelatado}</p></div><div className="os-actions"><button className="button button-secondary" onClick={() => abrirEdicao(selecionada)}><Edit3 size={16} />Editar</button><button className="button button-secondary" onClick={() => void gerarPDF()}><FileDown size={16} />PDF</button>{!selecionada.estoqueBaixado && <button className="button button-primary" onClick={() => void concluirOS()}><CheckCircle2 size={16} />Concluir e baixar peças</button>}</div></div>
          <div className="os-summary os-summary-5"><div><span>Diagnóstico</span><strong>{selecionada.diagnostico || 'Ainda não informado'}</strong></div><div><span>Técnico</span><strong>{selecionada.tecnicoNome || 'Não definido'}</strong></div><div><span>Garantia</span><strong>{selecionada.garantiaDias} dias</strong></div><div><span>Bloqueio</span><strong>{tiposBloqueio.find((tipo) => tipo.value === (selecionada.tipoBloqueio || 'NENHUM'))?.label || 'Sem bloqueio'}</strong></div><div><span>Total</span><strong className="total-highlight">{moeda(totaisSelecionada.valorTotal)}</strong></div></div>
          <div className="os-kpis"><div className="mini-kpi"><span>Serviços</span><strong>{moeda(totaisSelecionada.valorServicos)}</strong></div><div className="mini-kpi"><span>Peças</span><strong>{moeda(totaisSelecionada.valorProdutos)}</strong></div><div className="mini-kpi"><span>Desconto</span><strong>{moeda(selecionada.desconto)}</strong></div></div>
          <section className="embedded-panel"><div className="panel-header"><div><h3>Itens da OS</h3><p>O total é atualizado na mesma operação em que o item é gravado.</p></div></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>{itens.map((item) => <tr key={item.id}><td><span className="badge badge-muted">{item.tipo === 'PRODUTO' ? 'Produto' : 'Serviço'}</span></td><td>{item.descricao}</td><td>{item.quantidade}</td><td>{moeda(item.valorUnitario)}</td><td>{moeda(item.valorTotal)}</td></tr>)}{itensCarregados && itens.length === 0 && <tr><td colSpan={5}><div className="empty-state compact">Nenhum item adicionado.</div></td></tr>}</tbody></table></div>{!selecionada.estoqueBaixado && <div className="add-item-form add-item-form-6"><select value={tipoItem} onChange={(e) => { setTipoItem(e.target.value as typeof tipoItem); setReferenciaItem(''); setValorItem(0); }}><option value="SERVICO">Serviço</option><option value="PRODUTO">Produto</option></select><select value={referenciaItem} onChange={(e) => mudarReferencia(e.target.value)}><option value="">Selecione</option>{listaItensDisponiveis.map((item) => <option value={item.id} key={item.id}>{item.descricao}{tipoItem === 'PRODUTO' ? ` — estoque ${(item as Produto).estoqueAtual}` : ''}</option>)}</select><input type="number" min="0.01" step="0.01" value={quantidadeItem} onChange={(e) => setQuantidadeItem(Number(e.target.value || 0))} title="Quantidade" /><input type="number" min="0" step="0.01" value={valorItem} onChange={(e) => setValorItem(Number(e.target.value || 0))} title="Valor unitário" /><div className="item-total-box"><span>Parcial</span><strong>{moeda(totalParcialItem)}</strong></div><button className="button button-secondary" disabled={adicionandoItem} onClick={() => void adicionarItem()}><PackagePlus size={16} />Adicionar item</button></div>}</section>
        </div>}
      </Modal>
    </>
  );
}
