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
import { excluirOrdemServico } from '../lib/exclusoes';
import { empresaCollection, empresaDoc, empresaSubcollection } from '../lib/tenant';
import { gerarPdfOrdemServico } from '../lib/pdf';
import { dataHoraBr, hojeIso, moeda, normalizarTexto, statusLabel } from '../lib/utils';
import type {
  Cliente,
  ConfiguracaoEmpresa,
  FormaPagamentoVenda,
  OrdemServico,
  OrdemServicoItem,
  Produto,
  StatusOS,
  TipoBloqueio,
  Usuario,
} from '../types';

const statusDisponiveis: StatusOS[] = ['ABERTA', 'AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_PECA', 'EM_MANUTENCAO', 'PRONTA_PARA_RETIRADA', 'CANCELADA', 'SEM_CONSERTO'];
const tiposBloqueio: { value: TipoBloqueio; label: string }[] = [
  { value: 'NENHUM', label: 'Sem bloqueio' },
  { value: 'PIN', label: 'PIN / numérica' },
  { value: 'SENHA', label: 'Senha / texto' },
  { value: 'PADRAO', label: 'Padrão de desenho' },
];
const empresaPadrao: ConfiguracaoEmpresa = { nomeFantasia: 'NariCell Assistência Técnica', garantiaPadraoDias: 90, logoUrl: '/logo-naricell.jpg' };

const formVazio = {
  clienteId: '',
  clienteNome: '',
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
  const [descricaoItem, setDescricaoItem] = useState('');
  const [quantidadeItem, setQuantidadeItem] = useState(1);
  const [valorItem, setValorItem] = useState(0);
  const [adicionandoItem, setAdicionandoItem] = useState(false);
  const [tipoItemFormulario, setTipoItemFormulario] = useState<'PRODUTO' | 'SERVICO'>('SERVICO');
  const [descricaoItemFormulario, setDescricaoItemFormulario] = useState('');
  const [quantidadeItemFormulario, setQuantidadeItemFormulario] = useState(1);
  const [valorItemFormulario, setValorItemFormulario] = useState(0);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [formaPagamentoOS, setFormaPagamentoOS] = useState<FormaPagamentoVenda>('DINHEIRO');
  const [vencimentoCarteiraOS, setVencimentoCarteiraOS] = useState(hojeIso());
  const [registrandoPagamento, setRegistrandoPagamento] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const { usuario, empresaId } = useAuth();
  const { showToast } = useToast();
  const podeExcluir = usuario?.perfil === 'ADMIN';

  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId!, 'ordensServico'), orderBy('criadoEm', 'desc')), (snap) => setOrdens(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrdemServico))), () => showToast('Não foi possível carregar as ordens.', 'error')),
    [showToast, empresaId],
  );
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
    setDescricaoItemFormulario('');
    setQuantidadeItemFormulario(1);
    setValorItemFormulario(0);
    setModalForm(true);
  };

  const abrirEdicao = (os: OrdemServico) => {
    setEdicao(os);
    setForm({
      clienteId: os.clienteId,
      clienteNome: os.clienteNome,
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

  const adicionarItemAoRascunho = () => {
    const descricao = descricaoItemFormulario.trim();
    if (!descricao) return showToast('Informe o produto ou serviço para incluir.', 'error');
    if (quantidadeItemFormulario <= 0 || valorItemFormulario < 0) return showToast('Informe quantidade e valor válidos.', 'error');
    const item: OrdemServicoItem = {
      id: `rascunho-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tipo: tipoItemFormulario,
      produtoId: '',
      servicoId: '',
      descricao,
      quantidade: Number(quantidadeItemFormulario),
      valorUnitario: Number(valorItemFormulario),
      valorTotal: Number(quantidadeItemFormulario) * Number(valorItemFormulario),
    };
    setItensFormulario((atual) => [...atual, item]);
    setDescricaoItemFormulario('');
    setQuantidadeItemFormulario(1);
    setValorItemFormulario(0);
  };

  const salvarOS = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!form.clienteNome.trim()) return showToast('Informe o nome do cliente.', 'error');
    if (!usuario) return;
    if (edicao && carregandoItensFormulario) return showToast('Aguarde o carregamento dos itens antes de salvar.', 'info');
    setSalvando(true);

    try {
      const totais = calcularTotais(itensFormulario, form.desconto);
      const dadosBase = {
        clienteId: form.clienteId,
        clienteNome: form.clienteNome.trim(),
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
    if (!selecionada || !descricaoItem.trim()) return showToast('Informe o produto ou serviço.', 'error');
    if (quantidadeItem <= 0 || valorItem < 0) return showToast('Informe quantidade e valor válidos.', 'error');
    if (selecionada.estoqueBaixado) return showToast('A OS já foi concluída e não aceita novos itens.', 'error');
    setAdicionandoItem(true);
    try {
      const descricao = descricaoItem.trim();
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
          produtoId: '',
          servicoId: '',
          descricao,
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
          produtoId: '',
          servicoId: '',
          descricao,
          quantidade: Number(quantidadeItem),
          valorUnitario: Number(valorItem),
          valorTotal: valorTotalItem,
        },
      ], selecionada.desconto);
      atualizarSelecionada(selecionada.id, totaisLocais);
      setDescricaoItem('');
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
    const itensProduto = itens.filter((item) => item.tipo === 'PRODUTO' && item.produtoId);
    if (!window.confirm(`Concluir a OS #${String(selecionada.numero).padStart(5, '0')}? ${itensProduto.length} produto(s) vinculado(s) a cadastro terão baixa no estoque; itens digitados livremente não alteram estoque.`)) return;
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

  const abrirPagamentoOS = () => {
    if (!selecionada?.estoqueBaixado) return showToast('Conclua a OS e faça a baixa das peças antes do recebimento.', 'error');
    if (selecionada.pagamentoRegistrado) return showToast('O pagamento desta OS já foi registrado.', 'info');
    setFormaPagamentoOS('DINHEIRO');
    setVencimentoCarteiraOS(hojeIso());
    setModalPagamento(true);
  };

  const registrarPagamentoOS = async () => {
    if (!selecionada || !usuario) return;
    if (selecionada.pagamentoRegistrado) return showToast('O pagamento desta OS já foi registrado.', 'info');
    if (Number(totaisSelecionada.valorTotal || 0) <= 0) return showToast('A OS não possui valor para recebimento.', 'error');
    setRegistrandoPagamento(true);
    try {
      const osRef = empresaDoc(empresaId!, 'ordensServico', selecionada.id);
      await runTransaction(db, async (transaction) => {
        const fechamentoSnap = await transaction.get(empresaDoc(empresaId!, 'fechamentosCaixa', hojeIso()));
        if (fechamentoSnap.exists()) throw new Error('O caixa de hoje já foi fechado. Não é possível receber a OS.');
        const osSnap = await transaction.get(osRef);
        if (!osSnap.exists()) throw new Error('OS não encontrada.');
        const osAtual = osSnap.data() as OrdemServico;
        if (osAtual.pagamentoRegistrado) throw new Error('O pagamento desta OS já foi registrado por outro usuário.');
        const valor = Number(osAtual.valorTotal || totaisSelecionada.valorTotal || 0);
        const movimentoRef = formaPagamentoOS !== 'CARTEIRA' ? doc(empresaCollection(empresaId!, 'movimentacoesCaixa')) : null;
        const contaRef = formaPagamentoOS === 'CARTEIRA' ? doc(empresaCollection(empresaId!, 'contasReceber')) : null;
        const registroFinanceiroRef = doc(empresaCollection(empresaId!, 'registrosFinanceiros'));
        if (movimentoRef) transaction.set(movimentoRef, {
          tipo: 'ENTRADA', origem: 'ORDEM_SERVICO', origemId: selecionada.id, origemNumero: selecionada.numero,
          descricao: `Recebimento da OS #${String(selecionada.numero).padStart(5, '0')}`, clienteId: selecionada.clienteId, clienteNome: selecionada.clienteNome,
          valor, formaPagamento: formaPagamentoOS, data: hojeIso(), usuarioId: usuario.id, usuarioNome: usuario.nome, criadoEm: serverTimestamp(),
        });
        if (contaRef) transaction.set(contaRef, {
          clienteId: selecionada.clienteId, clienteNome: selecionada.clienteNome, ordemServicoId: selecionada.id, ordemServicoNumero: selecionada.numero,
          descricao: `OS #${String(selecionada.numero).padStart(5, '0')} — ${selecionada.aparelhoMarca} ${selecionada.aparelhoModelo}`,
          valorOriginal: valor, valorAberto: valor, vencimento: vencimentoCarteiraOS, status: 'ABERTA', observacoes: 'Gerada automaticamente no recebimento da OS.',
          registroFinanceiroId: registroFinanceiroRef.id, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
        transaction.set(registroFinanceiroRef, {
          tipo: formaPagamentoOS === 'CARTEIRA' ? 'CONTAS_RECEBER' : 'RECEITA',
          origem: 'ORDEM_SERVICO', origemId: selecionada.id, origemNumero: selecionada.numero,
          descricao: `OS #${String(selecionada.numero).padStart(5, '0')} — ${selecionada.aparelhoMarca} ${selecionada.aparelhoModelo}`,
          clienteId: selecionada.clienteId, clienteNome: selecionada.clienteNome,
          valor, formaPagamento: formaPagamentoOS,
          status: formaPagamentoOS === 'CARTEIRA' ? 'ABERTO' : 'RECEBIDO',
          vencimento: formaPagamentoOS === 'CARTEIRA' ? vencimentoCarteiraOS : '',
          contaReceberId: contaRef?.id ?? '', movimentacaoCaixaId: movimentoRef?.id ?? '',
          data: hojeIso(), usuarioId: usuario.id, usuarioNome: usuario.nome,
          criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
        });
        transaction.update(osRef, {
          status: 'ENTREGUE', pagamentoRegistrado: true, formaPagamento: formaPagamentoOS, dataPagamento: hojeIso(),
          movimentacaoCaixaId: movimentoRef?.id ?? '', contaReceberId: contaRef?.id ?? '', registroFinanceiroId: registroFinanceiroRef.id, atualizadoEm: serverTimestamp(),
        });
        transaction.set(doc(empresaSubcollection(empresaId!, 'ordensServico', selecionada.id, 'historico')), {
          descricao: formaPagamentoOS === 'CARTEIRA' ? 'OS entregue e lançada em carteira.' : `OS entregue e recebida em ${formaPagamentoOS}.`,
          usuarioNome: usuario.nome, criadoEm: serverTimestamp(),
        });
      });
      atualizarSelecionada(selecionada.id, { status: 'ENTREGUE', pagamentoRegistrado: true, formaPagamento: formaPagamentoOS, dataPagamento: hojeIso() });
      showToast(formaPagamentoOS === 'CARTEIRA' ? 'OS entregue e conta a receber criada.' : 'OS entregue e entrada registrada no caixa.');
      setModalPagamento(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível registrar o pagamento.', 'error');
    } finally { setRegistrandoPagamento(false); }
  };

  const gerarPDF = async () => {
    if (!selecionada) return;
    try {
      const clienteSnap = selecionada.clienteId
        ? await getDoc(empresaDoc(empresaId!, 'clientes', selecionada.clienteId))
        : null;
      await gerarPdfOrdemServico(
        { ...selecionada, ...totaisSelecionada },
        clienteSnap?.exists() ? ({ id: clienteSnap.id, ...clienteSnap.data() } as Cliente) : undefined,
        itens,
        empresa,
      );
    } catch {
      showToast('Não foi possível gerar o PDF.', 'error');
    }
  };

  const excluirOS = async (ordem: OrdemServico) => {
    if (!podeExcluir) return showToast('Somente administradores podem excluir ordens de serviço.', 'error');
    const avisoEstoque = ordem.estoqueBaixado ? ' As peças utilizadas serão devolvidas ao estoque.' : '';
    if (!window.confirm(`Excluir definitivamente a OS #${String(ordem.numero).padStart(5, '0')} de “${ordem.clienteNome}”?\n\nItens, histórico e registros financeiros vinculados serão removidos.${avisoEstoque} A numeração da OS não será reutilizada.`)) return;
    setExcluindoId(ordem.id);
    try {
      await excluirOrdemServico(empresaId!, ordem);
      if (selecionada?.id === ordem.id) {
        setModalDetalhe(false);
        setSelecionada(null);
      }
      if (edicao?.id === ordem.id) {
        setModalForm(false);
        setEdicao(null);
      }
      showToast('Ordem de serviço e registros vinculados excluídos.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível excluir a ordem de serviço.', 'error');
    } finally {
      setExcluindoId(null);
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
                  <td className="actions-cell"><button className="button button-small" onClick={() => abrirDetalhe(os)}>Abrir</button><button className="icon-button" title="Editar" onClick={() => abrirEdicao(os)}><Edit3 size={17} /></button>{podeExcluir && <button className="icon-button danger" title="Excluir OS" disabled={excluindoId === os.id} onClick={() => void excluirOS(os)}><Trash2 size={17} /></button>}</td>
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
            <input required value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value, clienteId: '' })} placeholder="Digite o nome do cliente" />
          </label>
          <label className="field"><span>Responsável</span><select value={form.tecnicoId} onChange={(e) => setForm({ ...form, tecnicoId: e.target.value })}><option value="">Não definido</option>{usuarios.filter((u) => u.ativo).map((u) => <option value={u.id} key={u.id}>{u.nome}</option>)}</select></label>
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
              {!edicao && <div className="add-item-form add-item-form-6 form-add-item"><select value={tipoItemFormulario} onChange={(e) => { setTipoItemFormulario(e.target.value as typeof tipoItemFormulario); setDescricaoItemFormulario(''); setValorItemFormulario(0); }}><option value="SERVICO">Serviço</option><option value="PRODUTO">Produto</option></select><input value={descricaoItemFormulario} onChange={(e) => setDescricaoItemFormulario(e.target.value)} placeholder="Digite o produto ou serviço" title="Descrição livre" /><input type="number" min="0.01" step="0.01" value={quantidadeItemFormulario} onChange={(e) => setQuantidadeItemFormulario(Number(e.target.value || 0))} title="Quantidade" /><input type="number" min="0" step="0.01" value={valorItemFormulario} onChange={(e) => setValorItemFormulario(Number(e.target.value || 0))} title="Preço livre" placeholder="Preço" /><div className="item-total-box"><span>Parcial</span><strong>{moeda(totalParcialFormulario)}</strong></div><button type="button" className="button button-secondary" onClick={adicionarItemAoRascunho}><PackagePlus size={16} />Incluir item</button></div>}
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
          <div className="os-detail-header"><div><span className={`status status-${selecionada.status.toLowerCase()}`}>{statusLabel(selecionada.status)}</span><h3>{selecionada.aparelhoMarca} {selecionada.aparelhoModelo}</h3><p>Defeito: {selecionada.defeitoRelatado}</p></div><div className="os-actions"><button className="button button-secondary" onClick={() => abrirEdicao(selecionada)}><Edit3 size={16} />Editar</button><button className="button button-secondary" onClick={() => void gerarPDF()}><FileDown size={16} />PDF</button>{podeExcluir && <button className="button button-danger-soft" disabled={excluindoId === selecionada.id} onClick={() => void excluirOS(selecionada)}><Trash2 size={16} />{excluindoId === selecionada.id ? 'Excluindo...' : 'Excluir OS'}</button>}{!selecionada.estoqueBaixado && <button className="button button-primary" onClick={() => void concluirOS()}><CheckCircle2 size={16} />Concluir e baixar peças</button>}{selecionada.estoqueBaixado && !selecionada.pagamentoRegistrado && <button className="button button-primary" onClick={abrirPagamentoOS}><CheckCircle2 size={16} />Receber e entregar</button>}{selecionada.pagamentoRegistrado && <span className="badge badge-success">Pago — {selecionada.formaPagamento}</span>}</div></div>
          <div className="os-summary os-summary-5"><div><span>Diagnóstico</span><strong>{selecionada.diagnostico || 'Ainda não informado'}</strong></div><div><span>Técnico</span><strong>{selecionada.tecnicoNome || 'Não definido'}</strong></div><div><span>Garantia</span><strong>{selecionada.garantiaDias} dias</strong></div><div><span>Bloqueio</span><strong>{tiposBloqueio.find((tipo) => tipo.value === (selecionada.tipoBloqueio || 'NENHUM'))?.label || 'Sem bloqueio'}</strong></div><div><span>Total</span><strong className="total-highlight">{moeda(totaisSelecionada.valorTotal)}</strong></div></div>
          <div className="os-kpis"><div className="mini-kpi"><span>Serviços</span><strong>{moeda(totaisSelecionada.valorServicos)}</strong></div><div className="mini-kpi"><span>Peças</span><strong>{moeda(totaisSelecionada.valorProdutos)}</strong></div><div className="mini-kpi"><span>Desconto</span><strong>{moeda(selecionada.desconto)}</strong></div></div>
          <section className="embedded-panel"><div className="panel-header"><div><h3>Itens da OS</h3><p>Produto, serviço e preço podem ser informados livremente, sem cadastro prévio.</p></div></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>{itens.map((item) => <tr key={item.id}><td><span className="badge badge-muted">{item.tipo === 'PRODUTO' ? 'Produto' : 'Serviço'}</span></td><td>{item.descricao}</td><td>{item.quantidade}</td><td>{moeda(item.valorUnitario)}</td><td>{moeda(item.valorTotal)}</td></tr>)}{itensCarregados && itens.length === 0 && <tr><td colSpan={5}><div className="empty-state compact">Nenhum item adicionado.</div></td></tr>}</tbody></table></div>{!selecionada.estoqueBaixado && <div className="add-item-form add-item-form-6"><select value={tipoItem} onChange={(e) => { setTipoItem(e.target.value as typeof tipoItem); setDescricaoItem(''); setValorItem(0); }}><option value="SERVICO">Serviço</option><option value="PRODUTO">Produto</option></select><input value={descricaoItem} onChange={(e) => setDescricaoItem(e.target.value)} placeholder="Digite o produto ou serviço" title="Descrição livre" /><input type="number" min="0.01" step="0.01" value={quantidadeItem} onChange={(e) => setQuantidadeItem(Number(e.target.value || 0))} title="Quantidade" /><input type="number" min="0" step="0.01" value={valorItem} onChange={(e) => setValorItem(Number(e.target.value || 0))} title="Preço livre" placeholder="Preço" /><div className="item-total-box"><span>Parcial</span><strong>{moeda(totalParcialItem)}</strong></div><button className="button button-secondary" disabled={adicionandoItem} onClick={() => void adicionarItem()}><PackagePlus size={16} />Adicionar item</button></div>}</section>
        </div>}
      </Modal>

      <Modal aberto={modalPagamento} aoFechar={() => setModalPagamento(false)} titulo="Receber e entregar OS">
        <div className="form-stack">
          <div className="info-box">OS: <strong>#{selecionada ? String(selecionada.numero).padStart(5, '0') : ''}</strong><br/>Cliente: <strong>{selecionada?.clienteNome}</strong><br/>Valor: <strong>{moeda(totaisSelecionada.valorTotal)}</strong></div>
          <label className="field"><span>Forma de pagamento</span><select value={formaPagamentoOS} onChange={(e) => setFormaPagamentoOS(e.target.value as FormaPagamentoVenda)}><option value="DINHEIRO">Dinheiro</option><option value="PIX">Pix</option><option value="CARTAO">Cartão</option><option value="CARTEIRA">Carteira / conta a receber</option></select></label>
          {formaPagamentoOS === 'CARTEIRA' && <label className="field"><span>Vencimento</span><input type="date" value={vencimentoCarteiraOS} onChange={(e) => setVencimentoCarteiraOS(e.target.value)}/></label>}
          <div className="modal-actions"><button className="button button-secondary" onClick={() => setModalPagamento(false)}>Cancelar</button><button className="button button-primary" disabled={registrandoPagamento} onClick={() => void registrarPagamentoOS()}>{registrandoPagamento ? 'Registrando...' : 'Confirmar recebimento'}</button></div>
        </div>
      </Modal>
    </>
  );
}
