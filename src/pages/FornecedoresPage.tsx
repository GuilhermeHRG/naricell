import { addDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Building2, Edit3, PlusCircle, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { normalizarTexto } from '../lib/utils';
import type { Fornecedor } from '../types';

const vazio = {
  nome: '',
  cpfCnpj: '',
  telefone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  observacoes: '',
  ativo: true,
};
type FormFornecedor = typeof vazio;

export function FornecedoresPage() {
  const empresaId = useAuth().empresaId!;
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<FormFornecedor>(vazio);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(
      query(empresaCollection(empresaId, 'fornecedores'), orderBy('nome')),
      (snap) => setFornecedores(snap.docs.map((documento) => ({ id: documento.id, ...documento.data() } as Fornecedor))),
      () => showToast('Não foi possível carregar os fornecedores.', 'error'),
    ),
    [empresaId, showToast],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!termo) return fornecedores;
    return fornecedores.filter((fornecedor) => normalizarTexto(
      `${fornecedor.nome} ${fornecedor.telefone ?? ''} ${fornecedor.whatsapp ?? ''} ${fornecedor.cpfCnpj ?? ''}`,
    ).includes(termo));
  }, [busca, fornecedores]);

  const abrirNovo = () => {
    setEdicao(null);
    setForm(vazio);
    setModal(true);
  };

  const abrirEdicao = (fornecedor: Fornecedor) => {
    setEdicao(fornecedor);
    setForm({
      nome: fornecedor.nome,
      cpfCnpj: fornecedor.cpfCnpj ?? '',
      telefone: fornecedor.telefone ?? '',
      whatsapp: fornecedor.whatsapp ?? '',
      email: fornecedor.email ?? '',
      endereco: fornecedor.endereco ?? '',
      observacoes: fornecedor.observacoes ?? '',
      ativo: fornecedor.ativo,
    });
    setModal(true);
  };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const dados = {
        ...form,
        nome: form.nome.trim(),
        cpfCnpj: form.cpfCnpj.trim(),
        telefone: form.telefone.trim(),
        whatsapp: form.whatsapp.trim(),
        email: form.email.trim(),
        endereco: form.endereco.trim(),
        observacoes: form.observacoes.trim(),
        atualizadoEm: serverTimestamp(),
      };
      if (edicao) await updateDoc(empresaDoc(empresaId, 'fornecedores', edicao.id), dados);
      else await addDoc(empresaCollection(empresaId, 'fornecedores'), { ...dados, criadoEm: serverTimestamp() });
      showToast(edicao ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      setModal(false);
    } catch {
      showToast('Não foi possível salvar o fornecedor.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (fornecedor: Fornecedor) => {
    if (!window.confirm(`Excluir o fornecedor “${fornecedor.nome}”? As OS já registradas não serão apagadas.`)) return;
    try {
      await deleteDoc(empresaDoc(empresaId, 'fornecedores', fornecedor.id));
      showToast('Fornecedor excluído.');
    } catch {
      showToast('Não foi possível excluir o fornecedor.', 'error');
    }
  };

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">CADASTROS</p><h2>Fornecedores</h2><p>Encontre, cadastre ou edite os fornecedores utilizados nas ordens de serviço.</p></div>
        <button className="button button-primary" onClick={abrirNovo}><PlusCircle size={18} />Novo fornecedor</button>
      </section>

      <section className="panel page-primary-panel">
        <div className="toolbar toolbar-clean">
          <label className="search-box"><Search size={18} /><input value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar fornecedor ou telefone" /></label>
          <span className="result-count">{filtrados.length} fornecedor(es)</span>
        </div>
        <div className="table-wrap">
          <table className="simple-table">
            <thead><tr><th>Fornecedor</th><th>Contato</th><th>Status</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {filtrados.map((fornecedor) => (
                <tr key={fornecedor.id}>
                  <td><div className="entity-cell"><span className="table-avatar"><Building2 size={16} /></span><strong>{fornecedor.nome}</strong></div></td>
                  <td>{fornecedor.whatsapp || fornecedor.telefone || 'Sem telefone'}</td>
                  <td><span className={`badge ${fornecedor.ativo ? 'badge-success' : 'badge-muted'}`}>{fornecedor.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="actions-cell"><button className="icon-button" title="Editar" onClick={() => abrirEdicao(fornecedor)}><Edit3 size={17} /></button><button className="icon-button danger" title="Excluir" onClick={() => void excluir(fornecedor)}><Trash2 size={17} /></button></td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={4}><div className="empty-state">Nenhum fornecedor encontrado.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modal} aoFechar={() => setModal(false)} titulo={edicao ? 'Editar fornecedor' : 'Novo fornecedor'} largura="lg">
        <form className="form-grid form-clean" onSubmit={salvar}>
          <label className="field field-full"><span>Nome / Razão social *</span><input required autoFocus value={form.nome} onChange={(evento) => setForm({ ...form, nome: evento.target.value })} /></label>
          <label className="field"><span>WhatsApp</span><input value={form.whatsapp} onChange={(evento) => setForm({ ...form, whatsapp: evento.target.value })} /></label>
          <label className="field"><span>Telefone</span><input value={form.telefone} onChange={(evento) => setForm({ ...form, telefone: evento.target.value })} /></label>
          <details className="form-disclosure field-full">
            <summary>Outros dados do fornecedor</summary>
            <div className="form-grid form-grid-inner">
              <label className="field"><span>CPF/CNPJ</span><input value={form.cpfCnpj} onChange={(evento) => setForm({ ...form, cpfCnpj: evento.target.value })} /></label>
              <label className="field"><span>E-mail</span><input type="email" value={form.email} onChange={(evento) => setForm({ ...form, email: evento.target.value })} /></label>
              <label className="field field-full"><span>Endereço</span><input value={form.endereco} onChange={(evento) => setForm({ ...form, endereco: evento.target.value })} /></label>
              <label className="field field-full"><span>Observações</span><textarea rows={2} value={form.observacoes} onChange={(evento) => setForm({ ...form, observacoes: evento.target.value })} /></label>
              <label className="checkbox-field field-full"><input type="checkbox" checked={form.ativo} onChange={(evento) => setForm({ ...form, ativo: evento.target.checked })} />Fornecedor ativo</label>
            </div>
          </details>
          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar fornecedor'}</button></div>
        </form>
      </Modal>
    </>
  );
}
