import { deleteUser, getAuth, signOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { deleteApp, getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { Perfil } from '../types';
import { db, firebaseConfig } from './firebase';

export interface UsuarioAdminPayload {
  uid?: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  senha?: string;
  empresaId?: string;
  empresaNome?: string;
}

type RespostaUsuario = { uid: string };

const APP_CADASTRO = 'cadastro-usuarios-secundario';

function obterAppCadastro(): FirebaseApp {
  return getApps().some((app) => app.name === APP_CADASTRO)
    ? getApp(APP_CADASTRO)
    : initializeApp(firebaseConfig, APP_CADASTRO);
}

export async function criarUsuarioSistema(payload: UsuarioAdminPayload): Promise<RespostaUsuario> {
  if (!payload.senha || payload.senha.length < 6) {
    throw new Error('A senha inicial deve ter pelo menos 6 caracteres.');
  }

  const appCadastro = obterAppCadastro();
  const authCadastro = getAuth(appCadastro);
  const email = payload.email.trim().toLowerCase();
  const credencial = await createUserWithEmailAndPassword(authCadastro, email, payload.senha);

  try {
    await setDoc(doc(db, 'usuarios', credencial.user.uid), {
      nome: payload.nome.trim(),
      email,
      perfil: payload.perfil,
      ativo: payload.ativo,
      empresaId: payload.empresaId || 'principal',
      empresaNome: payload.empresaNome || 'Empresa principal',
      authUid: credencial.user.uid,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    return { uid: credencial.user.uid };
  } catch (erro) {
    await deleteUser(credencial.user).catch(() => undefined);
    throw erro;
  } finally {
    await signOut(authCadastro).catch(() => undefined);
  }
}

export async function editarUsuarioSistema(payload: UsuarioAdminPayload): Promise<RespostaUsuario> {
  if (!payload.uid) throw new Error('UID do usuário não informado.');

  await updateDoc(doc(db, 'usuarios', payload.uid), {
    nome: payload.nome.trim(),
    perfil: payload.perfil,
    ativo: payload.ativo,
    empresaId: payload.empresaId || 'principal',
    empresaNome: payload.empresaNome || 'Empresa principal',
    atualizadoEm: serverTimestamp(),
  });

  return { uid: payload.uid };
}

export async function excluirUsuarioSistema(uid: string): Promise<RespostaUsuario> {
  await deleteDoc(doc(db, 'usuarios', uid));
  return { uid };
}

export async function encerrarAppCadastro() {
  const appCadastro = getApps().find((app) => app.name === APP_CADASTRO);
  if (appCadastro) await deleteApp(appCadastro);
}
