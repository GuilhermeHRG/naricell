import { addDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Edit3, PlusCircle, Search, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { normalizarTexto } from '../lib/utils';
import type { Cliente } from '../types';

const vazio = { nome: '', cpfCnpj: '', telefone: '', whatsapp: '', email: '', endereco: '', observacoes: '', ativo: true };
type FormCliente = typeof vazio;

export function ClientesPage() {
  const empresaId = useAuth().empresaId!;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormCliente>(vazio);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(query(empresaCollection(empresaId, 'clientes'), orderBy('nome')), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente))), () => showToast('Não foi possível carregar os clientes.', 'error')),
    [showToast],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarTexto(busca);
    if (!termo) return clientes;
    return clientes.filter((cliente) => normalizarTexto(`${cliente.nome} ${cliente.telefone ?? ''} ${cliente.whatsapp ?? ''} ${cliente.cpfCnpj ?? ''}`).includes(termo));
  }, [busca, clientes]);

  const abrirNovo = () => { setEdicao(null); setForm(vazio); setModal(true); };
  const abrirEdicao = (cliente: Cliente) => {
    setEdicao(cliente);
    setForm({ nome: cliente.nome, cpfCnpj: cliente.cpfCnpj ?? '', telefone: cliente.telefone ?? '', whatsapp: cliente.whatsapp ?? '', email: cliente.email ?? '', endereco: cliente.endereco ?? '', observacoes: cliente.observacoes ?? '', ativo: cliente.ativo });
    setModal(true);
  };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const dados = { ...form, nome: form.nome.trim(), atualizadoEm: serverTimestamp() };
      if (edicao) await updateDoc(empresaDoc(empresaId, 'clientes', edicao.id), dados);
      else await addDoc(empresaCollection(empresaId, 'clientes'), { ...dados, criadoEm: serverTimestamp() });
      showToast(edicao ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      setModal(false);
    } catch {
      showToast('Não foi possível salvar o cliente.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (cliente: Cliente) => {
    if (!window.confirm(`Excluir o cliente “${cliente.nome}”? As OS já registradas não serão apagadas.`)) return;
    try {
      await deleteDoc(empresaDoc(empresaId, 'clientes', cliente.id));
      showToast('Cliente excluído.');
    } catch {
      showToast('Não foi possível excluir o cliente.', 'error');
    }
  };

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">CADASTROS</p><h2>Clientes</h2><p>Encontre, cadastre ou edite em poucos cliques.</p></div>
        <button className="button button-primary" onClick={abrirNovo}><PlusCircle size={18} />Novo cliente</button>
      </section>

      <section className="panel page-primary-panel">
        <div className="toolbar toolbar-clean">
          <label className="search-box"><Search size={18} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou telefone" /></label>
          <span className="result-count">{filtrados.length} cliente(s)</span>
        </div>
        <div className="table-wrap">
          <table className="simple-table">
            <thead><tr><th>Cliente</th><th>Contato</th><th>Status</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {filtrados.map((cliente) => (
                <tr key={cliente.id}>
                  <td><div className="entity-cell"><span className="table-avatar"><UserRound size={16} /></span><strong>{cliente.nome}</strong></div></td>
                  <td>{cliente.whatsapp || cliente.telefone || 'Sem telefone'}</td>
                  <td><span className={`badge ${cliente.ativo ? 'badge-success' : 'badge-muted'}`}>{cliente.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="actions-cell"><button className="icon-button" title="Editar" onClick={() => abrirEdicao(cliente)}><Edit3 size={17} /></button><button className="icon-button danger" title="Excluir" onClick={() => void excluir(cliente)}><Trash2 size={17} /></button></td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={4}><div className="empty-state">Nenhum cliente encontrado.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modal} aoFechar={() => setModal(false)} titulo={edicao ? 'Editar cliente' : 'Novo cliente'} largura="lg">
        <form className="form-grid form-clean" onSubmit={salvar}>
          <label className="field field-full"><span>Nome completo / Razão social *</span><input required autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label className="field"><span>WhatsApp</span><input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
          <label className="field"><span>Telefone</span><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
          <details className="form-disclosure field-full">
            <summary>Outros dados do cliente</summary>
            <div className="form-grid form-grid-inner">
              <label className="field"><span>CPF/CNPJ</span><input value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} /></label>
              <label className="field"><span>E-mail</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="field field-full"><span>Endereço</span><input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
              <label className="field field-full"><span>Observações</span><textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></label>
              <label className="checkbox-field field-full"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Cliente ativo</label>
            </div>
          </details>
          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar cliente'}</button></div>
        </form>
      </Modal>
    </>
  );
}
