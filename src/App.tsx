import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { db } from './lib/firebase';
import { LICENCA_DOC_ID, isMasterEmail, licencaEstaAtiva } from './lib/licensing';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { Layout, type PageKey } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClientesPage } from './pages/ClientesPage';
import { FornecedoresPage } from './pages/FornecedoresPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { ServicosPage } from './pages/ServicosPage';
import { EstoquePage } from './pages/EstoquePage';
import { OrdensServicoPage } from './pages/OrdensServicoPage';
import { FinanceiroPage } from './pages/FinanceiroPage';
import { CaixaVendasPage } from './pages/CaixaVendasPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';
import { LicencaBloqueadaPage } from './pages/LicencaBloqueadaPage';
import { LicenciamentoPage } from './pages/LicenciamentoPage';
import type { LicencaSistema } from './types';

export function App() {
  const { carregando, firebaseUser, usuario, erroPerfil, logout } = useAuth();
  const [pagina, setPagina] = useState<PageKey>('dashboard');
  const [licenca, setLicenca] = useState<LicencaSistema | null>(null);
  const [licencaCarregada, setLicencaCarregada] = useState(false);
  const [erroLicenca, setErroLicenca] = useState<string | null>(null);
  const mestre = isMasterEmail(firebaseUser?.email);

  useEffect(() => {
    // Não abra o listener enquanto o Authentication ainda não confirmou a sessão.
    // Antes, ele era aberto deslogado, recebia permission-denied e não era
    // recriado quando um usuário comum entrava, pois `mestre` continuava false.
    if (!firebaseUser) {
      setLicenca(null);
      setErroLicenca(null);
      setLicencaCarregada(false);
      return undefined;
    }

    if (mestre) {
      setLicenca(null);
      setErroLicenca(null);
      setLicencaCarregada(true);
      return undefined;
    }

    setLicenca(null);
    setErroLicenca(null);
    setLicencaCarregada(false);

    return onSnapshot(
      doc(db, 'licencas', LICENCA_DOC_ID),
      (snap) => {
        setLicenca(snap.exists() ? ({ id: snap.id, ...snap.data() } as LicencaSistema) : null);
        setErroLicenca(null);
        setLicencaCarregada(true);
      },
      (erro) => {
        console.error('Erro ao carregar licenca:', erro);
        setLicenca(null);
        setErroLicenca(
          erro.code === 'permission-denied'
            ? 'Sem permissão para consultar licencas/status. Publique as regras atualizadas do Firestore.'
            : `Não foi possível consultar a licença (${erro.code}).`,
        );
        setLicencaCarregada(true);
      },
    );
  }, [firebaseUser?.uid, mestre]);

  if (carregando) {
    return <div className="loading-screen"><LoaderCircle className="spin" size={34} /><span>Carregando sistema...</span></div>;
  }

  if (!firebaseUser) return <LoginPage />;

  if (!mestre && (!usuario || erroPerfil)) {
    return (
      <div className="auth-shell">
        <section className="auth-card error-card">
          <ShieldAlert size={40} />
          <h1>Acesso não liberado</h1>
          <p>{erroPerfil ?? 'Não foi possível validar seu acesso.'}</p>
          <button className="button button-primary" onClick={() => void logout()}>Voltar ao login</button>
        </section>
      </div>
    );
  }

  if (!mestre && !licencaCarregada) {
    return <div className="loading-screen"><LoaderCircle className="spin" size={34} /><span>Validando liberação de uso...</span></div>;
  }

  if (!mestre && erroLicenca) {
    return (
      <div className="auth-shell">
        <section className="auth-card error-card">
          <ShieldAlert size={40} />
          <h1>Não foi possível validar a licença</h1>
          <p>{erroLicenca}</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>Tentar novamente</button>
          <button className="button button-secondary" onClick={() => void logout()}>Sair</button>
        </section>
      </div>
    );
  }

  if (!mestre && !licencaEstaAtiva(licenca)) {
    return <LicencaBloqueadaPage licenca={licenca} />;
  }

  const renderizarPagina = () => {
    if (mestre) {
      if (pagina === 'usuarios') return <UsuariosPage />;
      return <LicenciamentoPage />;
    }
    switch (pagina) {
      case 'clientes': return <ClientesPage />;
      case 'fornecedores': return <FornecedoresPage />;
      case 'produtos': return <ProdutosPage />;
      case 'servicos': return <ServicosPage />;
      case 'estoque': return <EstoquePage />;
      case 'ordens': return <OrdensServicoPage />;
      case 'caixa': return <CaixaVendasPage />;
      case 'financeiro': return <FinanceiroPage />;
      case 'usuarios': return <UsuariosPage />;
      case 'configuracoes': return <ConfiguracoesPage />;
      default: return <DashboardPage irPara={setPagina} />;
    }
  };

  return <ToastProvider><Layout pagina={mestre && pagina !== 'usuarios' ? 'fornecedor' : pagina} setPagina={setPagina}>{renderizarPagina()}</Layout></ToastProvider>;
}
