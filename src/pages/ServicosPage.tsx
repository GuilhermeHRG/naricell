import { addDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Edit3, PlusCircle, Search, Trash2, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { moeda, normalizarTexto } from '../lib/utils';
import type { Servico } from '../types';

const vazio = { descricao: '', categoria: 'Manutenção', precoPadrao: 0, garantiaDias: 90, ativo: true };
type FormServico = typeof vazio;

export function ServicosPage() {
  const empresaId = useAuth().empresaId!;
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Servico | null>(null);
  const [form, setForm] = useState<FormServico>(vazio);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId, 'servicos'), orderBy('descricao')), (snap) => setServicos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Servico))), () => showToast('Não foi possível carregar os serviços.', 'error')),
    [showToast],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!termo) return servicos;
    return servicos.filter((servico) => normalizarTexto(`${servico.descricao} ${servico.categoria ?? ''}`).includes(termo));
  }, [busca, servicos]);

  const abrirNovo = () => { setEdicao(null); setForm(vazio); setModal(true); };
  const abrirEdicao = (servico: Servico) => { setEdicao(servico); setForm({ descricao: servico.descricao, categoria: servico.categoria ?? '', precoPadrao: servico.precoPadrao, garantiaDias: servico.garantiaDias, ativo: servico.ativo }); setModal(true); };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const dados = { ...form, descricao: form.descricao.trim(), atualizadoEm: serverTimestamp() };
      if (edicao) await updateDoc(empresaDoc(empresaId, 'servicos', edicao.id), dados);
      else await addDoc(empresaCollection(empresaId, 'servicos'), { ...dados, criadoEm: serverTimestamp() });
      showToast(edicao ? 'Serviço atualizado.' : 'Serviço cadastrado.');
      setModal(false);
    } catch {
      showToast('Não foi possível salvar o serviço.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (servico: Servico) => {
    if (!window.confirm(`Excluir “${servico.descricao}”?`)) return;
    try { await deleteDoc(empresaDoc(empresaId, 'servicos', servico.id)); showToast('Serviço excluído.'); }
    catch { showToast('Não foi possível excluir o serviço.', 'error'); }
  };

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">CADASTROS</p><h2>Serviços de reparo</h2><p>Defina valores e garantia para lançar na OS rapidamente.</p></div>
        <button className="button button-primary" onClick={abrirNovo}><PlusCircle size={18} />Novo serviço</button>
      </section>

      <section className="panel page-primary-panel">
        <div className="toolbar toolbar-clean">
          <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço" /></label>
          <span className="result-count">{filtrados.length} serviço(s)</span>
        </div>
        <div className="table-wrap">
          <table className="simple-table">
            <thead><tr><th>Serviço</th><th>Valor</th><th>Garantia</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {filtrados.map((servico) => (
                <tr key={servico.id}>
                  <td><div className="entity-cell"><span className="table-avatar"><Wrench size={16} /></span><strong>{servico.descricao}</strong></div></td>
                  <td>{moeda(servico.precoPadrao)}</td>
                  <td>{servico.garantiaDias} dias</td>
                  <td className="actions-cell"><button className="icon-button" title="Editar" onClick={() => abrirEdicao(servico)}><Edit3 size={17} /></button><button className="icon-button danger" title="Excluir" onClick={() => void excluir(servico)}><Trash2 size={17} /></button></td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={4}><div className="empty-state">Nenhum serviço encontrado.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modal} aoFechar={() => setModal(false)} titulo={edicao ? 'Editar serviço' : 'Novo serviço'} largura="lg">
        <form className="form-grid form-clean" onSubmit={salvar}>
          <label className="field field-full"><span>Nome do serviço *</span><input required autoFocus value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Troca de conector de carga" /></label>
          <label className="field"><span>Valor padrão</span><input type="number" min="0" step="0.01" value={form.precoPadrao} onChange={(e) => setForm({ ...form, precoPadrao: Number(e.target.value || 0) })} /></label>
          <label className="field"><span>Garantia em dias</span><input type="number" min="0" value={form.garantiaDias} onChange={(e) => setForm({ ...form, garantiaDias: Number(e.target.value || 0) })} /></label>
          <details className="form-disclosure field-full">
            <summary>Mais informações</summary>
            <div className="form-grid form-grid-inner">
              <label className="field"><span>Categoria</span><input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></label>
              <label className="checkbox-field field-full"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Serviço ativo para uso na OS</label>
            </div>
          </details>
          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar serviço'}</button></div>
        </form>
      </Modal>
    </>
  );
}
