import {
  Boxes,
  Building2,
  ClipboardList,
  ContactRound,
  Crown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Settings,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { isMasterEmail } from '../lib/licensing';
import type { Perfil } from '../types';

export type PageKey = 'dashboard' | 'clientes' | 'produtos' | 'servicos' | 'estoque' | 'ordens' | 'caixa' | 'financeiro' | 'usuarios' | 'configuracoes' | 'fornecedor';

interface ItemMenu {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  perfis?: Perfil[];
  somenteMestre?: boolean;
}

const itens: ItemMenu[] = [
  { key: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { key: 'clientes', label: 'Clientes', icon: ContactRound },
  { key: 'produtos', label: 'Produtos e peças', icon: PackageSearch },
  { key: 'servicos', label: 'Serviços de reparo', icon: Wrench },
  { key: 'estoque', label: 'Estoque', icon: Boxes, perfis: ['ADMIN', 'ATENDENTE'] },
  { key: 'ordens', label: 'Ordens de serviço', icon: ClipboardList },
  { key: 'caixa', label: 'Caixa e vendas', icon: ShoppingCart, perfis: ['ADMIN', 'ATENDENTE'] },
  { key: 'financeiro', label: 'Contas e financeiro', icon: ReceiptText, perfis: ['ADMIN', 'ATENDENTE'] },
  { key: 'usuarios', label: 'Equipe e acessos', icon: UsersRound, perfis: ['ADMIN'] },
  { key: 'configuracoes', label: 'Dados da loja', icon: Settings, perfis: ['ADMIN'] },
  { key: 'fornecedor', label: 'Empresas e licenças', icon: Crown, somenteMestre: true },
];

interface LayoutProps {
  pagina: PageKey;
  setPagina: (pagina: PageKey) => void;
  children: ReactNode;
}

export function Layout({ pagina, setPagina, children }: LayoutProps) {
  const { usuario, firebaseUser, logout } = useAuth();
  const [aberto, setAberto] = useState(false);
  const mestre = isMasterEmail(firebaseUser?.email);
  const permitidos = mestre
    ? itens.filter((item) => item.somenteMestre || item.key === 'usuarios')
    : itens.filter((item) => !item.somenteMestre && (!item.perfis || (usuario && item.perfis.includes(usuario.perfil))));
  const selecionado = itens.find((item) => item.key === pagina)?.label ?? 'Sistema';

  const navegar = (item: PageKey) => {
    setPagina(item);
    setAberto(false);
  };

  return (
    <div className="shell">
      {aberto && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setAberto(false)} />}
      <aside className={`sidebar ${aberto ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-logo-wrap">{mestre ? <Crown size={24} /> : <Building2 size={24} />}</div>
          <div>
            <strong>{mestre ? 'Fornecedor do sistema' : 'Assistência Técnica'}</strong>
            <span>{mestre ? 'Painel de licença' : 'Controle operacional'}</span>
          </div>
          <button className="sidebar-close icon-button" onClick={() => setAberto(false)}><X size={20} /></button>
        </div>
        <nav className="nav-menu">
          {permitidos.map(({ key, label, icon: Icon, somenteMestre }) => (
            <button key={key} className={`nav-item ${pagina === key ? 'active' : ''} ${somenteMestre ? 'nav-master-item' : ''}`} onClick={() => navegar(key)}>
              <Icon size={19} /><span>{label}</span>{somenteMestre && <Crown size={14} className="nav-master-crown" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{usuario?.nome.slice(0, 1).toUpperCase()}</div>
          <div className="sidebar-user-data"><strong>{usuario?.nome}</strong><span>{mestre ? 'ACESSO MESTRE' : usuario?.perfil}</span></div>
          <button className="icon-button" title="Sair" onClick={() => void logout()}><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="menu-mobile icon-button" onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          <div><p className="eyebrow">{mestre ? 'Área restrita' : 'Gestão da assistência'}</p><h1>{selecionado}</h1></div>
          <div className="topbar-right"><FileText size={18} /><span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></div>
        </header>
        <div className="page-content"><div className={`app-page app-page-${pagina}`}>{children}</div></div>
      </main>
    </div>
  );
}
