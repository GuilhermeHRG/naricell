import { addDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Edit3, PackagePlus, PlusCircle, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { gerarCodigoProduto, moeda, normalizarTexto, numero } from '../lib/utils';
import type { Produto } from '../types';

const novoProduto = () => ({ codigo: gerarCodigoProduto(), descricao: '', categoria: 'Peças', marca: '', modeloCompativel: '', custo: 0, precoVenda: 0, estoqueAtual: 0, estoqueMinimo: 1, localizacao: '', fornecedor: '', ativo: true });
type FormProduto = ReturnType<typeof novoProduto>;

export function ProdutosPage() {
  const empresaId = useAuth().empresaId!;
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Produto | null>(null);
  const [form, setForm] = useState<FormProduto>(novoProduto());
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId, 'produtos'), orderBy('descricao')), (snap) => setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto))), () => showToast('Não foi possível carregar os produtos.', 'error')),
    [showToast],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!termo) return produtos;
    return produtos.filter((produto) => normalizarTexto(`${produto.codigo} ${produto.descricao} ${produto.marca ?? ''} ${produto.modeloCompativel ?? ''}`).includes(termo));
  }, [busca, produtos]);

  const abrirNovo = () => { setEdicao(null); setForm(novoProduto()); setModal(true); };
  const abrirEdicao = (produto: Produto) => {
    setEdicao(produto);
    setForm({ codigo: produto.codigo, descricao: produto.descricao, categoria: produto.categoria ?? '', marca: produto.marca ?? '', modeloCompativel: produto.modeloCompativel ?? '', custo: produto.custo, precoVenda: produto.precoVenda, estoqueAtual: produto.estoqueAtual, estoqueMinimo: produto.estoqueMinimo, localizacao: produto.localizacao ?? '', fornecedor: produto.fornecedor ?? '', ativo: produto.ativo });
    setModal(true);
  };
  const numeroForm = (campo: keyof FormProduto, valor: string) => setForm({ ...form, [campo]: Number(valor || 0) });

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const dados = { ...form, codigo: form.codigo.trim(), descricao: form.descricao.trim(), atualizadoEm: serverTimestamp() };
      if (edicao) await updateDoc(empresaDoc(empresaId, 'produtos', edicao.id), dados);
      else await addDoc(empresaCollection(empresaId, 'produtos'), { ...dados, criadoEm: serverTimestamp() });
      showToast(edicao ? 'Peça atualizada.' : 'Peça cadastrada.');
      setModal(false);
    } catch {
      showToast('Não foi possível salvar a peça.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (produto: Produto) => {
    if (!window.confirm(`Excluir “${produto.descricao}”?`)) return;
    try { await deleteDoc(empresaDoc(empresaId, 'produtos', produto.id)); showToast('Peça excluída.'); }
    catch { showToast('Não foi possível excluir a peça.', 'error'); }
  };

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">CADASTROS</p><h2>Produtos e peças</h2><p>Veja saldo, preço e mantenha o cadastro simples.</p></div>
        <button className="button button-primary" onClick={abrirNovo}><PlusCircle size={18} />Nova peça</button>
      </section>

      <section className="panel page-primary-panel">
        <div className="toolbar toolbar-clean">
          <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou código" /></label>
          <span className="result-count">{filtrados.length} item(ns)</span>
        </div>
        <div className="table-wrap">
          <table className="simple-table">
            <thead><tr><th>Produto</th><th>Estoque</th><th>Venda</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {filtrados.map((produto) => (
                <tr key={produto.id}>
                  <td><strong>{produto.descricao}</strong><small>{produto.codigo}{produto.marca ? ` · ${produto.marca}` : ''}</small></td>
                  <td><span className={`stock-number ${produto.estoqueAtual <= produto.estoqueMinimo ? 'critical' : ''}`}>{numero(produto.estoqueAtual)} un.<small>Mín. {numero(produto.estoqueMinimo)}</small></span></td>
                  <td>{moeda(produto.precoVenda)}</td>
                  <td className="actions-cell"><button className="icon-button" title="Editar" onClick={() => abrirEdicao(produto)}><Edit3 size={17} /></button><button className="icon-button danger" title="Excluir" onClick={() => void excluir(produto)}><Trash2 size={17} /></button></td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={4}><div className="empty-state">Nenhuma peça encontrada.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modal} aoFechar={() => setModal(false)} titulo={edicao ? 'Editar peça' : 'Nova peça'} largura="lg">
        <form className="form-grid form-clean" onSubmit={salvar}>
          <label className="field field-full"><span>Nome da peça *</span><input required autoFocus value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Tela iPhone 11" /></label>
          <label className="field"><span>Preço de venda</span><input min="0" step="0.01" type="number" value={form.precoVenda} onChange={(e) => numeroForm('precoVenda', e.target.value)} /></label>
          <label className="field"><span>Estoque atual</span><input min="0" step="0.01" type="number" value={form.estoqueAtual} onChange={(e) => numeroForm('estoqueAtual', e.target.value)} /></label>
          <details className="form-disclosure field-full">
            <summary>Mais informações da peça</summary>
            <div className="form-grid form-grid-inner">
              <label className="field"><span>Código</span><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
              <label className="field"><span>Estoque mínimo</span><input min="0" step="0.01" type="number" value={form.estoqueMinimo} onChange={(e) => numeroForm('estoqueMinimo', e.target.value)} /></label>
              <label className="field"><span>Categoria</span><input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></label>
              <label className="field"><span>Marca</span><input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></label>
              <label className="field"><span>Modelo compatível</span><input value={form.modeloCompativel} onChange={(e) => setForm({ ...form, modeloCompativel: e.target.value })} /></label>
              <label className="field"><span>Preço de custo</span><input min="0" step="0.01" type="number" value={form.custo} onChange={(e) => numeroForm('custo', e.target.value)} /></label>
              <label className="field"><span>Localização</span><input value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value })} /></label>
              <label className="field"><span>Fornecedor</span><input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></label>
              <label className="checkbox-field field-full"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Peça ativa para uso na OS</label>
            </div>
          </details>
          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}><PackagePlus size={18} />{salvando ? 'Salvando...' : 'Salvar peça'}</button></div>
        </form>
      </Modal>
    </>
  );
}
