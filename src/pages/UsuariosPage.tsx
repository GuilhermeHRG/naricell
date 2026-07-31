import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Edit3, PlusCircle, ShieldCheck, Trash2, UserCog, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { criarUsuarioSistema, editarUsuarioSistema, excluirUsuarioSistema } from '../lib/usuariosAdmin';
import type { Perfil, Usuario } from '../types';

const perfis: Perfil[] = ['ADMIN', 'ATENDENTE', 'TECNICO', 'FINANCEIRO', 'CONSULTA'];
const vazio = { nome: '', email: '', senha: '', perfil: 'ATENDENTE' as Perfil, ativo: true };
const EMPRESA_ID = 'principal';

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [modal, setModal] = useState(false);
  const [edicao, setEdicao] = useState<Usuario | null>(null);
  const [form, setForm] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { usuario: usuarioAtual } = useAuth();

  useEffect(() => onSnapshot(
    query(collection(db, 'usuarios'), orderBy('nome')),
    (snap) => setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Usuario))),
    () => showToast('Não foi possível carregar os usuários.', 'error'),
  ), [showToast]);

  const abrirNovo = () => {
    setEdicao(null);
    setForm(vazio);
    setModal(true);
  };

  const abrirEdicao = (usuario: Usuario) => {
    setEdicao(usuario);
    setForm({ nome: usuario.nome, email: usuario.email, senha: '', perfil: usuario.perfil, ativo: usuario.ativo });
    setModal(true);
  };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      const payload = {
        uid: edicao?.id,
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        senha: edicao ? undefined : form.senha,
        perfil: form.perfil,
        ativo: form.ativo,
        empresaId: EMPRESA_ID,
        empresaNome: edicao?.empresaNome || 'Empresa principal',
      };

      if (edicao) {
        await editarUsuarioSistema(payload);
        showToast('Perfil e permissões atualizados no sistema.', 'success');
      } else {
        await criarUsuarioSistema(payload);
        showToast('Usuário criado no Authentication e vinculado ao sistema.', 'success');
      }
      setModal(false);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível salvar o usuário.';
      showToast(mensagem.replace(/^Firebase:\s*/i, ''), 'error');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (usuario: Usuario) => {
    if (!window.confirm(`Remover o acesso de ${usuario.nome}? O cadastro será excluído do sistema, mas o login continuará existindo no Firebase Authentication.`)) return;
    setExcluindoId(usuario.id);
    try {
      await excluirUsuarioSistema(usuario.id);
      showToast('Acesso removido do sistema. Exclua o login manualmente no Authentication, caso necessário.', 'success');
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Não foi possível excluir o usuário.';
      showToast(mensagem.replace(/^Firebase:\s*/i, ''), 'error');
    } finally {
      setExcluindoId(null);
    }
  };

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">ACESSO E SEGURANÇA</p>
          <h2>Equipe do sistema</h2>
          <p>Crie, edite e exclua usuários vinculados à empresa desta instalação.</p>
        </div>
        <button className="button button-primary" onClick={abrirNovo}><PlusCircle size={18} />Novo usuário</button>
      </section>

      <section className="panel page-primary-panel users-panel">
        <div className="panel-header panel-header-compact">
          <div><h3>Usuários cadastrados</h3><p>Novos usuários são criados no Authentication e vinculados automaticamente ao Firestore.</p></div>
          <span className="result-count result-count-inline">{usuarios.length} usuário(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>E-mail</th><th>Empresa</th><th>Perfil</th><th>Status</th><th className="actions-column">Ações</th></tr></thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td><div className="entity-cell"><span className="table-avatar"><UserRound size={16} /></span><strong>{usuario.nome}</strong></div></td>
                  <td>{usuario.email}</td>
                  <td>{usuario.empresaNome || 'Empresa principal'}</td>
                  <td><span className="badge badge-info"><ShieldCheck size={13} />{usuario.perfil}</span></td>
                  <td><span className={`badge ${usuario.ativo ? 'badge-success' : 'badge-muted'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="actions-cell">
                    <button className="icon-button" title="Editar usuário" onClick={() => abrirEdicao(usuario)} disabled={usuario.id === usuarioAtual?.id}><Edit3 size={17} /></button>
                    <button className="icon-button danger" title="Remover acesso do sistema" onClick={() => void excluir(usuario)} disabled={usuario.id === usuarioAtual?.id || excluindoId === usuario.id}><Trash2 size={17} /></button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && <tr><td colSpan={6}><div className="empty-state">Nenhum usuário cadastrado.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="permission-guide permission-guide-compact">
        <div className="permission-icon"><UserCog size={20} /></div>
        <div><strong>Gerenciamento sem Cloud Functions</strong><p>Ao criar, o sistema gera o login no Authentication usando uma sessão secundária e cria <b>usuarios/UID</b>. Na edição, altera nome, perfil e status no Firestore. A remoção apaga apenas o vínculo do sistema; a exclusão definitiva do login deve ser feita no Firebase Console.</p></div>
      </section>

      <Modal aberto={modal} aoFechar={() => setModal(false)} titulo={edicao ? 'Editar usuário' : 'Novo usuário'}>
        <form className="form-grid" onSubmit={salvar}>
          <label className="field field-full"><span>Nome *</span><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
          <label className="field field-full"><span>E-mail *</span><input required type="email" disabled={Boolean(edicao)} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><small>{edicao ? 'Sem backend administrativo, o e-mail do Authentication não pode ser alterado por esta tela.' : 'Este e-mail será usado para criar o login no Firebase Authentication.'}</small></label>
          {!edicao && <label className="field field-full"><span>Senha inicial *</span><input required minLength={6} type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /><small>Mínimo de 6 caracteres.</small></label>}
          <label className="field"><span>Perfil *</span><select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>{perfis.map((perfil) => <option key={perfil}>{perfil}</option>)}</select></label>
          <label className="checkbox-field field-full"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Usuário ativo</label>
          <div className="modal-actions field-full"><button type="button" className="button button-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Salvando...' : edicao ? 'Atualizar permissões' : 'Criar e vincular usuário'}</button></div>
        </form>
      </Modal>
    </>
  );
}
