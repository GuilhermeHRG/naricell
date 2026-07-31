import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Building2, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { empresaDoc } from '../lib/tenant';
import type { ConfiguracaoEmpresa } from '../types';

const padrao: ConfiguracaoEmpresa = {
  nomeFantasia: 'NariCell Assistência Técnica',
  razaoSocial: '',
  cnpj: '',
  telefone: '',
  email: '',
  endereco: '',
  garantiaPadraoDias: 90,
  logoUrl: '/logo-naricell.jpg',
};

export function ConfiguracoesPage() {
  const empresaId = useAuth().empresaId!;
  const [form, setForm] = useState<ConfiguracaoEmpresa>(padrao);
  const [salvando, setSalvando] = useState(false);
  const { showToast } = useToast();

  useEffect(
    () => onSnapshot(empresaDoc(empresaId, 'configuracoes', 'empresa'), (snap) => { if (snap.exists()) setForm({ ...padrao, ...(snap.data() as ConfiguracaoEmpresa) }); }, () => showToast('Não foi possível carregar as configurações.', 'error')),
    [showToast],
  );

  const salvar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await setDoc(empresaDoc(empresaId, 'configuracoes', 'empresa'), { ...form, garantiaPadraoDias: Number(form.garantiaPadraoDias || 0), atualizadoEm: serverTimestamp() }, { merge: true });
      showToast('Dados da loja atualizados.');
    } catch {
      showToast('Não foi possível salvar as configurações.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <section className="page-heading"><div><p className="eyebrow">CONFIGURAÇÕES</p><h2>Dados da loja</h2><p>Use apenas o necessário para aparecer na OS e no PDF.</p></div></section>
      <section className="panel form-panel page-primary-panel">
        <div className="panel-header panel-header-compact"><div><h3>Informações principais</h3><p>Nome, contato e garantia.</p></div><Building2 size={21} /></div>
        <form className="form-grid form-clean" onSubmit={salvar}>
          <label className="field field-span-2"><span>Nome da assistência *</span><input required value={form.nomeFantasia} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></label>
          <label className="field"><span>Telefone</span><input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></label>
          <label className="field"><span>Garantia padrão (dias)</span><input min="0" type="number" value={form.garantiaPadraoDias} onChange={(e) => setForm({ ...form, garantiaPadraoDias: Number(e.target.value || 0) })} /></label>
          <details className="form-disclosure field-full">
            <summary>Outras informações do PDF</summary>
            <div className="form-grid form-grid-inner">
              <label className="field field-full"><span>URL da logo</span><input value={form.logoUrl ?? ''} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="/logo-naricell.jpg" /></label>
              {form.logoUrl && <div className="field field-full logo-preview-box"><span>Pré-visualização</span><img src={form.logoUrl} alt="Logo da empresa" className="logo-preview" /></div>}
              <label className="field"><span>Razão social</span><input value={form.razaoSocial ?? ''} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></label>
              <label className="field"><span>CNPJ</span><input value={form.cnpj ?? ''} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></label>
              <label className="field"><span>E-mail</span><input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="field field-full"><span>Endereço</span><input value={form.endereco ?? ''} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></label>
            </div>
          </details>
          <div className="modal-actions field-full"><button className="button button-primary" disabled={salvando}><Save size={18} />{salvando ? 'Salvando...' : 'Salvar dados'}</button></div>
        </form>
      </section>
    </>
  );
}
