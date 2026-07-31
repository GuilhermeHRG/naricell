import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import { isMasterEmail } from '../lib/licensing';
import type { Usuario } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  usuario: Usuario | null;
  empresaId: string | null;
  carregando: boolean;
  erroPerfil: string | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const INSTALACAO_ID = 'principal';

const criarUsuarioMestre = (user: User): Usuario => ({
  id: user.uid,
  nome: user.displayName?.trim() || user.email?.split('@')[0] || 'Fornecedor',
  email: user.email ?? '',
  perfil: 'ADMIN',
  ativo: true,
});

async function carregarUsuario(user: User): Promise<{ usuario: Usuario | null; erro: string | null }> {
  if (isMasterEmail(user.email)) return { usuario: criarUsuarioMestre(user), erro: null };
  try {
    const snap = await getDoc(doc(db, 'usuarios', user.uid));
    if (!snap.exists()) return { usuario: null, erro: 'Usuário autenticado, mas sem cadastro em usuarios/{uid}.' };
    const usuario = { id: snap.id, ...snap.data() } as Usuario;
    if (!usuario.ativo) return { usuario, erro: 'Este usuário está inativo.' };
    return { usuario, erro: null };
  } catch (erro) {
    const codigo = typeof erro === 'object' && erro && 'code' in erro ? String((erro as { code?: string }).code) : '';
    return { usuario: null, erro: codigo === 'permission-denied' ? 'Sem permissão para carregar o perfil. Publique as novas regras do Firestore.' : 'Não foi possível carregar o perfil.' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  const recarregarPerfil = async () => {
    if (!auth.currentUser) { setUsuario(null); setErroPerfil(null); return; }
    const dados = await carregarUsuario(auth.currentUser);
    setUsuario(dados.usuario); setErroPerfil(dados.erro);
  };

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    setCarregando(true); setFirebaseUser(user);
    if (!user) { setUsuario(null); setErroPerfil(null); setCarregando(false); return; }
    const dados = await carregarUsuario(user);
    setUsuario(dados.usuario); setErroPerfil(dados.erro); setCarregando(false);
  }), []);

  const value = useMemo<AuthContextValue>(() => ({
    firebaseUser,
    usuario,
    empresaId: firebaseUser ? INSTALACAO_ID : null,
    carregando,
    erroPerfil,
    login: async (email, senha) => { await signInWithEmailAndPassword(auth, email.trim(), senha); },
    logout: () => signOut(auth),
    recarregarPerfil,
  }), [firebaseUser, usuario, carregando, erroPerfil]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return contexto;
}
