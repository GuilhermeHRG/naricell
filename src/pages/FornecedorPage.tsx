import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { Building2, CalendarDays, CheckCircle2, CircleX, PlusCircle, Save, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { db, firebaseConfig } from '../lib/firebase';
import { LICENCA_DOC_ID, LICENCA_GESTAO_DOC_ID, dataFimDoDia, dataLicencaInput, licencaEstaAtiva } from '../lib/licensing';
import { empresaCollection, empresaDoc } from '../lib/tenant';
import { dataBr, moeda } from '../lib/utils';
import type { Empresa, LicencaEmpresa, Perfil, Usuario } from '../types';

const perfis: Perfil[] = ['ADMIN', 'ATENDENTE', 'TECNICO', 'FINANCEIRO', 'CONSULTA'];

interface EmpresaResumo {
  empresa: Empresa;
  licenca: LicencaEmpresa | null;
  totalUsuarios: number;
  usuariosAtivos: number;
}

const dataPadraoLicenca = () => {
  const data = new Date();
  data.setDate(data.getDate() + 30);
  return data.toISOString().slice(0, 10);
};

const formEmpresaVazio = {
  nomeFantasia: '',
  cnpj: '',
  telefone: '',
  email: '',
  nomeAdmin: '',
  emailAdmin: '',
  senhaAdmin: '',
  usarUsuarioExistente: false,
  uidAdminExistente: '',
  plano: 'Mensal',
  valorMensal: 0,
  venceEm: dataPadraoLicenca(),
  licencaAtiva: true,
};

const formUsuarioVazio = { nome: '', email: '', senha: '', perfil: 'ATENDENTE' as Perfil, ativo: true };

export function FornecedorPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [resumos, setResumos] = useState<EmpresaResumo[]>([]);
  const [carregandoResumos, setCarregandoResumos] = useState(false);
  const [modalEmpresa, setModalEmpresa] = useState(false);
  const [modalGestao, setModalGestao] = useState(false);
  const [modalUsuario, setModalUsuario] = useState(false);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<EmpresaResumo | null>(null);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<Usuario[]>([]);
  const [formEmpresa, setFormEmpresa] = useState(formEmpresaVazio);
  const [formUsuario, setFormUsuario] = useState(formUsuarioVazio);
  const [formLicenca, setFormLicenca] = useState({ plano: 'Mensal', valorMensal: 0, venceEm: dataPadraoLicenca(), ativo: true, observacoes: '' });
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(
      query(collection(db, 'empresas'), orderBy('nomeFantasia')),
      (snap) => setEmpresas(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Empresa))),
      () => showToast('Não foi possível carregar as empresas.', 'error'),
    ),
    [showToast],
  );

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      setCarregandoResumos(true);
      try {
        const lista = await Promise.all(empresas.map(async (empresa) => {
          const [licencaSnap, usuariosSnap] = await Promise.all([
            getDoc(empresaDoc(empresa.id, 'licencas', LICENCA_DOC_ID)),
            getDocs(empresaCollection(empresa.id, 'usuarios')),
          ]);
          const usuarios = usuariosSnap.docs.map((item) => item.data() as Usuario);
          return {
            empresa,
            licenca: licencaSnap.exists() ? ({ id: licencaSnap.id, ...licencaSnap.data() } as LicencaEmpresa) : null,
            totalUsuarios: usuarios.length,
            usuariosAtivos: usuarios.filter((usuario) => usuario.ativo).length,
          } as EmpresaResumo;
        }));
        if (ativo) setResumos(lista);
      } catch {
        if (ativo) showToast('Não foi possível carregar os resumos das empresas.', 'error');
      } finally {
        if (ativo) setCarregandoResumos(false);
      }
    };
    void carregar();
    return () => { ativo = false; };
  }, [empresas, showToast]);

  useEffect(() => {
    if (!empresaSelecionada) {
      setUsuariosEmpresa([]);
      return undefined;
    }
    const empresaId = empresaSelecionada.empresa.id;
    return onSnapshot(
      query(empresaCollection(empresaId, 'usuarios'), orderBy('nome')),
      (snap) => setUsuariosEmpresa(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Usuario))),
      () => showToast('Não foi possível carregar os usuários desta empresa.', 'error'),
    );
  }, [empresaSelecionada?.empresa.id, showToast]);

  const quantidadeAtivas = useMemo(() => resumos.filter((resumo) => resumo.empresa.ativa && licencaEstaAtiva(resumo.licenca)).length, [resumos]);
  const usuariosAtivos = useMemo(() => resumos.reduce((total, resumo) => total + resumo.usuariosAtivos, 0), [resumos]);

  const abrirCriarEmpresa = () => {
    setFormEmpresa(formEmpresaVazio);
    setModalEmpresa(true);
  };

  const criarEmpresa = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!formEmpresa.usarUsuarioExistente && formEmpresa.senhaAdmin.length < 6) return showToast('A senha inicial do administrador deve ter ao menos 6 caracteres.', 'error');
    setSalvando(true);
    try {
      const emailAdmin = formEmpresa.emailAdmin.trim().toLowerCase();
      let authSecundario: ReturnType<typeof getAuth> | null = null;
      let usuarioCriado: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;
      let adminUid = formEmpresa.uidAdminExistente.trim();
      if (formEmpresa.usarUsuarioExistente) {
        if (!adminUid) throw new Error('Informe o UID do usuário já existente no Firebase Authentication.');
      } else {
        const nomeSecundario = 'gerenciador-empresas';
        const { getApps, initializeApp } = await import('firebase/app');
        const appSecundario = getApps().find((app) => app.name === nomeSecundario) ?? initializeApp(firebaseConfig, nomeSecundario);
        authSecundario = getAuth(appSecundario);
        const credencial = await createUserWithEmailAndPassword(authSecundario, emailAdmin, formEmpresa.senhaAdmin);
        usuarioCriado = credencial.user;
        adminUid = credencial.user.uid;
      }
      try {
        const empresaRef = doc(collection(db, 'empresas'));
        const lote = writeBatch(db);
        const empresaId = empresaRef.id;
        const dadosEmpresa = {
          nomeFantasia: formEmpresa.nomeFantasia.trim(),
          razaoSocial: '',
          cnpj: formEmpresa.cnpj.trim(),
          telefone: formEmpresa.telefone.trim(),
          email: formEmpresa.email.trim(),
          ativa: true,
          criadoPor: 'guilhermeg.dev@gmail.com',
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        };
        lote.set(empresaRef, dadosEmpresa);
        lote.set(empresaDoc(empresaId, 'configuracoes', 'app'), { inicializado: true, criadoEm: serverTimestamp() });
        lote.set(empresaDoc(empresaId, 'configuracoes', 'empresa'), {
          nomeFantasia: formEmpresa.nomeFantasia.trim(),
          cnpj: formEmpresa.cnpj.trim(),
          telefone: formEmpresa.telefone.trim(),
          email: formEmpresa.email.trim(),
          garantiaPadraoDias: 90,
          logoUrl: '/logo-naricell.jpg',
          atualizadoEm: serverTimestamp(),
        });
        lote.set(empresaDoc(empresaId, 'configuracoes', 'contadorOS'), { ultimoNumero: 0, atualizadoEm: serverTimestamp() });
        const licenca: Omit<LicencaEmpresa, 'id'> = {
          empresaId,
          plano: formEmpresa.plano,
          ativo: formEmpresa.licencaAtiva,
          venceEm: dataFimDoDia(formEmpresa.venceEm),
          valorMensal: Number(formEmpresa.valorMensal || 0),
          observacoes: '',
          atualizadoPorEmail: 'guilhermeg.dev@gmail.com',
        };
        lote.set(empresaDoc(empresaId, 'licencas', LICENCA_DOC_ID), { ...licenca, atualizadoEm: serverTimestamp() });
        lote.set(empresaDoc(empresaId, 'licencas', LICENCA_GESTAO_DOC_ID), { ...licenca, atualizadoEm: serverTimestamp() });
        lote.set(empresaDoc(empresaId, 'usuarios', adminUid), {
          nome: formEmpresa.nomeAdmin.trim(),
          email: emailAdmin,
          perfil: 'ADMIN',
          ativo: true,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
        lote.set(doc(db, 'acessos', adminUid), {
          empresaId,
          email: emailAdmin,
          perfil: 'ADMIN',
          ativo: true,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
        await lote.commit();
        showToast('Empresa criada, licença definida e administrador vinculado.');
        setModalEmpresa(false);
      } catch (erro) {
        if (usuarioCriado) await deleteUser(usuarioCriado).catch(() => undefined);
        throw erro;
      } finally {
        if (authSecundario) await signOut(authSecundario).catch(() => undefined);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível criar a empresa.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const abrirGestao = (resumo: EmpresaResumo) => {
    setEmpresaSelecionada(resumo);
    setFormLicenca({
      plano: resumo.licenca?.plano || 'Mensal',
      valorMensal: Number(resumo.licenca?.valorMensal || 0),
      venceEm: dataLicencaInput(resumo.licenca?.venceEm) || dataPadraoLicenca(),
      ativo: resumo.licenca?.ativo ?? true,
      observacoes: resumo.licenca?.observacoes || '',
    });
    setModalGestao(true);
  };

  const salvarLicenca = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!empresaSelecionada) return;
    setSalvando(true);
    try {
      const empresaId = empresaSelecionada.empresa.id;
      const dados = {
        empresaId,
        plano: formLicenca.plano,
        ativo: formLicenca.ativo,
        venceEm: dataFimDoDia(formLicenca.venceEm),
        valorMensal: Number(formLicenca.valorMensal || 0),
        observacoes: formLicenca.observacoes.trim(),
        atualizadoPorEmail: 'guilhermeg.dev@gmail.com',
        atualizadoEm: serverTimestamp(),
      };
      const lote = writeBatch(db);
      lote.set(empresaDoc(empresaId, 'licencas', LICENCA_DOC_ID), dados, { merge: true });
      lote.set(empresaDoc(empresaId, 'licencas', LICENCA_GESTAO_DOC_ID), dados, { merge: true });
      await lote.commit();
      showToast('Licença da empresa atualizada.');
    } catch {
      showToast('Não foi possível atualizar a licença.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const criarUsuarioEmpresa = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!empresaSelecionada) return;
    if (formUsuario.senha.length < 6) return showToast('A senha inicial deve ter ao menos 6 caracteres.', 'error');
    setSalvando(true);
    try {
      const email = formUsuario.email.trim().toLowerCase();
      const nomeSecundario = 'gerenciador-usuarios-fornecedor';
      const { getApps, initializeApp } = await import('firebase/app');
      const appSecundario = getApps().find((app) => app.name === nomeSecundario) ?? initializeApp(firebaseConfig, nomeSecundario);
      const authSecundario = getAuth(appSecundario);
      const credencial = await createUserWithEmailAndPassword(authSecundario, email, formUsuario.senha);
      try {
        const empresaId = empresaSelecionada.empresa.id;
        const lote = writeBatch(db);
        lote.set(empresaDoc(empresaId, 'usuarios', credencial.user.uid), {
          nome: formUsuario.nome.trim(),
          email,
          perfil: formUsuario.perfil,
          ativo: formUsuario.ativo,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
        lote.set(doc(db, 'acessos', credencial.user.uid), {
          empresaId,
          email,
          perfil: formUsuario.perfil,
          ativo: formUsuario.ativo,
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
        await lote.commit();
        setModalUsuario(false);
        setFormUsuario(formUsuarioVazio);
        showToast('Usuário criado e vinculado à empresa.');
      } catch (erro) {
        await deleteUser(credencial.user).catch(() => undefined);
        throw erro;
      } finally {
        await signOut(authSecundario).catch(() => undefined);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível criar o usuário.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const alternarEmpresa = async (resumo: EmpresaResumo) => {
    try {
      await updateDoc(doc(db, 'empresas', resumo.empresa.id), { ativa: !resumo.empresa.ativa, atualizadoEm: serverTimestamp() });
      showToast(resumo.empresa.ativa ? 'Empresa inativada.' : 'Empresa ativada.');
    } catch {
      showToast('Não foi possível alterar a empresa.', 'error');
    }
  };

  const liberarPor = (dias: number) => {
    const data = new Date();
    data.setDate(data.getDate() + dias);
    setFormLicenca((atual) => ({ ...atual, ativo: true, venceEm: data.toISOString().slice(0, 10) }));
  };

  return (
    <section className="supplier-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">PAINEL DO FORNECEDOR</p>
          <h2>Empresas, usuários e licenças</h2>
          <p>Crie cada assistência, vincule usuários e mantenha dados totalmente separados por empresa.</p>
        </div>
        <button className="button button-primary" onClick={abrirCriarEmpresa}><PlusCircle size={18} />Nova empresa</button>
      </section>

      <section className="supplier-summary-grid">
        <article className="supplier-summary-card"><span className="supplier-summary-icon"><Building2 size={20} /></span><div><small>Empresas cadastradas</small><strong>{empresas.length}</strong></div></article>
        <article className="supplier-summary-card"><span className="supplier-summary-icon success"><CheckCircle2 size={20} /></span><div><small>Empresas ativas</small><strong>{quantidadeAtivas}</strong></div></article>
        <article className="supplier-summary-card"><span className="supplier-summary-icon violet"><UsersRound size={20} /></span><div><small>Usuários ativos</small><strong>{usuariosAtivos}</strong></div></article>
      </section>

      <section className="panel supplier-companies-panel">
        <div className="panel-header"><div><h3>Empresas cadastradas</h3><p>Uma licença, uma equipe e uma base de dados isolada por empresa.</p></div></div>
        <div className="table-wrap">
          <table className="simple-table">
            <thead><tr><th>Empresa</th><th>Usuários</th><th>Licença</th><th>Validade</th><th>Mensalidade</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {resumos.map((resumo) => {
                const ativa = resumo.empresa.ativa && licencaEstaAtiva(resumo.licenca);
                return <tr key={resumo.empresa.id}>
                  <td><strong>{resumo.empresa.nomeFantasia}</strong><small>{resumo.empresa.cnpj || resumo.empresa.email || 'Sem CNPJ/e-mail'}</small></td>
                  <td>{resumo.usuariosAtivos}/{resumo.totalUsuarios} ativos</td>
                  <td>{resumo.licenca?.plano || 'Não definida'}</td>
                  <td>{resumo.licenca?.venceEm ? dataBr(resumo.licenca.venceEm) : '-'}</td>
                  <td>{moeda(resumo.licenca?.valorMensal || 0)}</td>
                  <td><span className={`badge ${ativa ? 'badge-success' : 'badge-muted'}`}>{ativa ? 'Liberada' : 'Bloqueada/vencida'}</span></td>
                  <td className="actions-cell"><button className="button button-small" onClick={() => abrirGestao(resumo)}>Gerenciar</button><button className="icon-button" title={resumo.empresa.ativa ? 'Inativar empresa' : 'Ativar empresa'} onClick={() => void alternarEmpresa(resumo)}>{resumo.empresa.ativa ? <CircleX size={17} /> : <CheckCircle2 size={17} />}</button></td>
                </tr>;
              })}
              {!carregandoResumos && resumos.length === 0 && <tr><td colSpan={7}><div className="empty-state">Nenhuma empresa cadastrada. Crie a primeira assistência para começar.</div></td></tr>}
              {carregandoResumos && <tr><td colSpan={7}><div className="empty-state">Carregando empresas...</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal aberto={modalEmpresa} aoFechar={() => setModalEmpresa(false)} titulo="Criar nova empresa" largura="xl">
        <form className="form-grid" onSubmit={criarEmpresa}>
          <label className="field field-span-2"><span>Nome fantasia da assistência *</span><input required value={formEmpresa.nomeFantasia} onChange={(e) => setFormEmpresa({ ...formEmpresa, nomeFantasia: e.target.value })} placeholder="Ex.: NariCell Assistência Técnica" /></label>
          <label className="field"><span>CNPJ</span><input value={formEmpresa.cnpj} onChange={(e) => setFormEmpresa({ ...formEmpresa, cnpj: e.target.value })} /></label>
          <label className="field"><span>Telefone</span><input value={formEmpresa.telefone} onChange={(e) => setFormEmpresa({ ...formEmpresa, telefone: e.target.value })} /></label>
          <label className="field field-span-2"><span>E-mail da empresa</span><input type="email" value={formEmpresa.email} onChange={(e) => setFormEmpresa({ ...formEmpresa, email: e.target.value })} /></label>
          <div className="field field-full"><span>Administrador inicial da empresa</span><div className="form-grid form-grid-inner"><label className="field"><span>Nome *</span><input required value={formEmpresa.nomeAdmin} onChange={(e) => setFormEmpresa({ ...formEmpresa, nomeAdmin: e.target.value })} /></label><label className="field"><span>E-mail de login *</span><input required type="email" value={formEmpresa.emailAdmin} onChange={(e) => setFormEmpresa({ ...formEmpresa, emailAdmin: e.target.value })} /></label><label className="checkbox-field field-full"><input type="checkbox" checked={formEmpresa.usarUsuarioExistente} onChange={(e) => setFormEmpresa({ ...formEmpresa, usarUsuarioExistente: e.target.checked })} />Vincular usuário já criado no Firebase Authentication</label>{formEmpresa.usarUsuarioExistente ? <label className="field field-full"><span>UID do usuário existente *</span><input required value={formEmpresa.uidAdminExistente} onChange={(e) => setFormEmpresa({ ...formEmpresa, uidAdminExistente: e.target.value })} placeholder="Copie o UID na tela Firebase Authentication → Users" /></label> : <label className="field"><span>Senha inicial *</span><input required minLength={6} type="password" value={formEmpresa.senhaAdmin} onChange={(e) => setFormEmpresa({ ...formEmpresa, senhaAdmin: e.target.value })} /></label>}</div></div>
          <div className="field field-full"><span>Licença inicial</span><div className="form-grid form-grid-inner"><label className="field"><span>Plano</span><select value={formEmpresa.plano} onChange={(e) => setFormEmpresa({ ...formEmpresa, plano: e.target.value })}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Teste</option></select></label><label className="field"><span>Mensalidade</span><input min="0" step="0.01" type="number" value={formEmpresa.valorMensal} onChange={(e) => setFormEmpresa({ ...formEmpresa, valorMensal: Number(e.target.value || 0) })} /></label><label className="field"><span>Liberada até *</span><input required type="date" value={formEmpresa.venceEm} onChange={(e) => setFormEmpresa({ ...formEmpresa, venceEm: e.target.value })} /></label><label className="checkbox-field field"><input type="checkbox" checked={formEmpresa.licencaAtiva} onChange={(e) => setFormEmpresa({ ...formEmpresa, licencaAtiva: e.target.checked })} />Liberar uso ao criar</label></div></div>
          <div className="modal-actions field-full"><button className="button button-secondary" type="button" onClick={() => setModalEmpresa(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}><Building2 size={17} />{salvando ? 'Criando...' : 'Criar empresa'}</button></div>
        </form>
      </Modal>

      <Modal aberto={modalGestao} aoFechar={() => setModalGestao(false)} titulo={empresaSelecionada ? `Gerenciar — ${empresaSelecionada.empresa.nomeFantasia}` : 'Gerenciar empresa'} largura="xl">
        {empresaSelecionada && <div className="supplier-manage-modal">
          <form className="form-grid" onSubmit={salvarLicenca}>
            <div className="field field-full"><span>Licença da empresa</span><div className="master-form-actions"><button className="button button-secondary" type="button" onClick={() => liberarPor(30)}><CalendarDays size={16} />+30 dias</button><button className="button button-secondary" type="button" onClick={() => liberarPor(365)}><CalendarDays size={16} />+1 ano</button></div></div>
            <label className="field"><span>Plano</span><select value={formLicenca.plano} onChange={(e) => setFormLicenca({ ...formLicenca, plano: e.target.value })}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Teste</option></select></label>
            <label className="field"><span>Mensalidade</span><input min="0" step="0.01" type="number" value={formLicenca.valorMensal} onChange={(e) => setFormLicenca({ ...formLicenca, valorMensal: Number(e.target.value || 0) })} /></label>
            <label className="field"><span>Liberada até</span><input required type="date" value={formLicenca.venceEm} onChange={(e) => setFormLicenca({ ...formLicenca, venceEm: e.target.value })} /></label>
            <label className="checkbox-field field"><input type="checkbox" checked={formLicenca.ativo} onChange={(e) => setFormLicenca({ ...formLicenca, ativo: e.target.checked })} />Licença liberada</label>
            <label className="field field-full"><span>Observações do fornecedor</span><textarea rows={2} value={formLicenca.observacoes} onChange={(e) => setFormLicenca({ ...formLicenca, observacoes: e.target.value })} /></label>
            <div className="modal-actions field-full"><button className="button button-primary" disabled={salvando}><Save size={16} />{salvando ? 'Salvando...' : 'Salvar licença'}</button></div>
          </form>
          <section className="embedded-panel supplier-users-box"><div className="panel-header"><div><h3>Usuários vinculados</h3><p>Estes usuários só conseguem acessar os dados desta empresa.</p></div><button className="button button-secondary" onClick={() => { setFormUsuario(formUsuarioVazio); setModalUsuario(true); }}><UserPlus size={16} />Novo usuário</button></div><div className="table-wrap"><table><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead><tbody>{usuariosEmpresa.map((usuario) => <tr key={usuario.id}><td>{usuario.nome}</td><td>{usuario.email}</td><td><span className="badge badge-info"><ShieldCheck size={13} />{usuario.perfil}</span></td><td><span className={`badge ${usuario.ativo ? 'badge-success' : 'badge-muted'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span></td></tr>)}{usuariosEmpresa.length === 0 && <tr><td colSpan={4}><div className="empty-state compact">Nenhum usuário vinculado.</div></td></tr>}</tbody></table></div></section>
        </div>}
      </Modal>

      <Modal aberto={modalUsuario} aoFechar={() => setModalUsuario(false)} titulo="Novo usuário da empresa">
        <form className="form-grid" onSubmit={criarUsuarioEmpresa}>
          <label className="field field-full"><span>Nome *</span><input required value={formUsuario.nome} onChange={(e) => setFormUsuario({ ...formUsuario, nome: e.target.value })} /></label>
          <label className="field field-full"><span>E-mail *</span><input required type="email" value={formUsuario.email} onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })} /></label>
          <label className="field field-full"><span>Senha inicial *</span><input required minLength={6} type="password" value={formUsuario.senha} onChange={(e) => setFormUsuario({ ...formUsuario, senha: e.target.value })} /></label>
          <label className="field"><span>Perfil</span><select value={formUsuario.perfil} onChange={(e) => setFormUsuario({ ...formUsuario, perfil: e.target.value as Perfil })}>{perfis.map((perfil) => <option key={perfil}>{perfil}</option>)}</select></label>
          <label className="checkbox-field field"><input type="checkbox" checked={formUsuario.ativo} onChange={(e) => setFormUsuario({ ...formUsuario, ativo: e.target.checked })} />Usuário ativo</label>
          <div className="modal-actions field-full"><button type="button" className="button button-secondary" onClick={() => setModalUsuario(false)}>Cancelar</button><button className="button button-primary" disabled={salvando}>{salvando ? 'Criando...' : 'Criar usuário'}</button></div>
        </form>
      </Modal>
    </section>
  );
}
