import { collection, doc, onSnapshot, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { Building2, CalendarDays, CheckCircle2, CircleX, Crown, Save, ShieldCheck, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { LICENCA_DOC_ID, LICENCA_GESTAO_DOC_ID, dataFimDoDia, dataLicencaInput, isMasterEmail, licencaEstaAtiva } from '../lib/licensing';
import { dataBr, moeda } from '../lib/utils';
import type { LicencaSistema, Usuario } from '../types';

const padrao: LicencaSistema = {
  id: LICENCA_DOC_ID,
  clienteNome: 'NariCell Assistência Técnica',
  plano: 'Mensal',
  ativo: true,
  valorMensal: 0,
};

type FormLicenca = {
  clienteNome: string;
  plano: string;
  ativo: boolean;
  venceEm: string;
  valorMensal: number;
};

const formPadrao: FormLicenca = {
  clienteNome: padrao.clienteNome,
  plano: padrao.plano,
  ativo: true,
  venceEm: '',
  valorMensal: 0,
};

function descricaoStatus(licenca: LicencaSistema | null, ativa: boolean) {
  if (!licenca) return 'Não configurada';
  if (!licenca.ativo) return 'Bloqueada';
  return ativa ? 'Ativa' : 'Vencida';
}

export function LicenciamentoPage() {
  const [licenca, setLicenca] = useState<LicencaSistema | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState<FormLicenca>(formPadrao);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    let status: Partial<LicencaSistema> | null = null;
    let gestao: Partial<LicencaSistema> | null = null;

    const atualizar = () => {
      const dados = status || gestao ? ({ id: LICENCA_DOC_ID, ...(status ?? {}), ...(gestao ?? {}) } as LicencaSistema) : null;
      setLicenca(dados);
      setForm({
        clienteNome: dados?.clienteNome || padrao.clienteNome,
        plano: dados?.plano || padrao.plano,
        ativo: dados?.ativo ?? true,
        venceEm: dataLicencaInput(dados?.venceEm),
        valorMensal: Number(dados?.valorMensal || 0),
      });
    };

    const cancelarStatus = onSnapshot(
      doc(db, 'licencas', LICENCA_DOC_ID),
      (snap) => { status = snap.exists() ? (snap.data() as Partial<LicencaSistema>) : null; atualizar(); },
      () => showToast('Não foi possível carregar a licença.', 'error'),
    );
    const cancelarGestao = onSnapshot(
      doc(db, 'licencas', LICENCA_GESTAO_DOC_ID),
      (snap) => { gestao = snap.exists() ? (snap.data() as Partial<LicencaSistema>) : null; atualizar(); },
      () => showToast('Não foi possível carregar os dados da empresa.', 'error'),
    );
    return () => { cancelarStatus(); cancelarGestao(); };
  }, [showToast]);

  useEffect(
    () => onSnapshot(
      collection(db, 'usuarios'),
      (snap) => setUsuarios(snap.docs.map((item) => ({ id: item.id, ...item.data() } as Usuario)).filter((item) => !isMasterEmail(item.email))),
      () => showToast('Não foi possível carregar os usuários da empresa.', 'error'),
    ),
    [showToast],
  );

  const ativa = licencaEstaAtiva(licenca);
  const status = descricaoStatus(licenca, ativa);
  const usuariosAtivos = useMemo(() => usuarios.filter((usuario) => usuario.ativo), [usuarios]);
  const diasRestantes = useMemo(() => {
    if (!licenca?.venceEm) return null;
    const data = licenca.venceEm instanceof Date ? licenca.venceEm : licenca.venceEm.toDate();
    return Math.ceil((data.getTime() - Date.now()) / 86_400_000);
  }, [licenca]);

  const abrirGerenciamento = () => {
    setForm({
      clienteNome: licenca?.clienteNome || padrao.clienteNome,
      plano: licenca?.plano || padrao.plano,
      ativo: licenca?.ativo ?? true,
      venceEm: dataLicencaInput(licenca?.venceEm),
      valorMensal: Number(licenca?.valorMensal || 0),
    });
    setModalAberto(true);
  };

  const liberarPor = (dias: number) => {
    const base = licenca?.venceEm
      ? (licenca.venceEm instanceof Date ? licenca.venceEm : licenca.venceEm.toDate())
      : new Date();
    const inicio = base.getTime() > Date.now() ? base : new Date();
    const proxima = new Date(inicio);
    proxima.setDate(proxima.getDate() + dias);
    setForm((atual) => ({ ...atual, ativo: true, venceEm: dataLicencaInput(proxima) }));
  };

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!form.venceEm) return showToast('Informe a data de validade.', 'error');
    setSalvando(true);
    try {
      const lote = writeBatch(db);
      lote.set(
        doc(db, 'licencas', LICENCA_DOC_ID),
        {
          clienteNome: form.clienteNome.trim() || padrao.clienteNome,
          ativo: form.ativo,
          venceEm: Timestamp.fromDate(dataFimDoDia(form.venceEm)),
          atualizadoEm: serverTimestamp(),
          criadoEm: licenca?.criadoEm || serverTimestamp(),
        },
        { merge: true },
      );
      lote.set(
        doc(db, 'licencas', LICENCA_GESTAO_DOC_ID),
        {
          plano: form.plano.trim() || 'Mensal',
          valorMensal: Number(form.valorMensal || 0),
          atualizadoPor: firebaseUser?.uid || '',
          atualizadoPorEmail: firebaseUser?.email || '',
          atualizadoEm: serverTimestamp(),
          criadoEm: licenca?.criadoEm || serverTimestamp(),
        },
        { merge: true },
      );
      await lote.commit();
      setModalAberto(false);
      showToast('Licença atualizada.', 'success');
    } catch {
      showToast('Não foi possível salvar a licença. Verifique as regras do Firestore.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="master-portal">
      <header className="master-portal-heading">
        <div>
          <p className="eyebrow">ACESSO DO FORNECEDOR</p>
          <h2>Painel de licenças</h2>
          <p>Visão resumida da empresa atual, licença e usuários operacionais.</p>
        </div>
        <span className="master-access-chip"><Crown size={16} />Fornecedor</span>
      </header>

      <div className="master-stats">
        <article className="master-stat-card master-stat-card-blue">
          <span className="master-stat-icon"><Building2 size={19} /></span>
          <div><small>Empresas ativas</small><strong>{ativa ? '1' : '0'}</strong><p>Esta instalação</p></div>
        </article>
        <article className="master-stat-card master-stat-card-green">
          <span className="master-stat-icon"><ShieldCheck size={19} /></span>
          <div><small>Licenças</small><strong>{licenca ? '1' : '0'}</strong><p>{status}</p></div>
        </article>
        <article className="master-stat-card master-stat-card-violet">
          <span className="master-stat-icon"><UsersRound size={19} /></span>
          <div><small>Usuários ativos</small><strong>{usuariosAtivos.length}</strong><p>{usuarios.length} cadastrado(s)</p></div>
        </article>
      </div>

      <div className="master-content-grid">
        <article className="master-panel master-license-panel">
          <div className="master-panel-head">
            <div>
              <span className="master-panel-kicker">EMPRESA E LICENÇA</span>
              <h3>{licenca?.clienteNome || padrao.clienteNome}</h3>
            </div>
            <button className="button button-primary" type="button" onClick={abrirGerenciamento}>Gerenciar licença</button>
          </div>

          <div className="master-license-fields">
            <div><small>Status</small><strong className={ativa ? 'license-text-active' : 'license-text-blocked'}>{status}</strong></div>
            <div><small>Plano</small><strong>{licenca?.plano || '-'}</strong></div>
            <div><small>Validade</small><strong>{licenca?.venceEm ? dataBr(licenca.venceEm) : 'Não definida'}</strong></div>
            <div><small>Mensalidade</small><strong>{moeda(licenca?.valorMensal || 0)}</strong></div>
          </div>

          <div className={`master-license-banner ${ativa ? 'is-active' : 'is-blocked'}`}>
            {ativa ? <CheckCircle2 size={18} /> : <CircleX size={18} />}
            <span>
              {licenca?.venceEm
                ? `${status}${diasRestantes !== null ? ` · ${diasRestantes >= 0 ? `${diasRestantes} dia(s) restantes` : `${Math.abs(diasRestantes)} dia(s) vencida`}` : ''}`
                : 'Defina uma validade para liberar o uso do sistema.'}
            </span>
          </div>
        </article>

        <article className="master-panel master-users-panel">
          <div className="master-panel-head">
            <div>
              <span className="master-panel-kicker">USUÁRIOS DA EMPRESA</span>
              <h3>{usuarios.length} usuário(s)</h3>
            </div>
            <span className="master-users-count">{usuariosAtivos.length} ativos</span>
          </div>
          <div className="master-users-list">
            {usuarios.map((usuario) => (
              <div className="master-user-row" key={usuario.id}>
                <div className="master-user-avatar">{usuario.nome.slice(0, 1).toUpperCase()}</div>
                <div className="master-user-data"><strong>{usuario.nome}</strong><span>{usuario.email}</span></div>
                <span className={`master-user-status ${usuario.ativo ? 'active' : 'inactive'}`}>{usuario.ativo ? usuario.perfil : 'Inativo'}</span>
              </div>
            ))}
            {usuarios.length === 0 && <div className="master-empty-state">Nenhum usuário operacional cadastrado.</div>}
          </div>
        </article>
      </div>

      <Modal aberto={modalAberto} aoFechar={() => setModalAberto(false)} titulo="Gerenciar licença" largura="lg">
        <form className="master-license-form" onSubmit={salvar}>
          <div className="master-form-actions">
            <button className="button button-secondary" type="button" onClick={() => liberarPor(30)}><CalendarDays size={16} />+30 dias</button>
            <button className="button button-secondary" type="button" onClick={() => liberarPor(365)}><CalendarDays size={16} />+1 ano</button>
          </div>
          <div className="form-grid">
            <label className="field field-span-2">
              <span>Empresa</span>
              <input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} />
            </label>
            <label className="field">
              <span>Plano</span>
              <select value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })}>
                <option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Teste</option>
              </select>
            </label>
            <label className="field">
              <span>Mensalidade (R$)</span>
              <input min="0" step="0.01" type="number" value={form.valorMensal} onChange={(e) => setForm({ ...form, valorMensal: Number(e.target.value || 0) })} />
            </label>
            <label className="field">
              <span>Liberado até *</span>
              <input required type="date" value={form.venceEm} onChange={(e) => setForm({ ...form, venceEm: e.target.value })} />
            </label>
            <label className="checkbox-field field">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Licença liberada
            </label>
          </div>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={() => setModalAberto(false)}>Cancelar</button>
            <button className="button button-primary" disabled={salvando}><Save size={16} />{salvando ? 'Salvando...' : 'Salvar licença'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
