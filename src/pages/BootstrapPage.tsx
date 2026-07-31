import { createUserWithEmailAndPassword, type User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ShieldCheck, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { auth, db } from '../lib/firebase';

interface BootstrapPageProps {
  aoConcluir: () => void;
  aoEntrarComUsuarioExistente: () => void;
  usuarioAutenticado: User | null;
}

export function BootstrapPage({ aoConcluir, aoEntrarComUsuarioExistente, usuarioAutenticado }: BootstrapPageProps) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const gravarConfiguracaoInicial = async (uid: string, emailAdministrador: string) => {
    const lote = writeBatch(db);

    lote.set(doc(db, 'usuarios', uid), {
      nome: nome.trim(),
      email: emailAdministrador.toLowerCase(),
      perfil: 'ADMIN',
      ativo: true,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    lote.set(doc(db, 'configuracoes', 'app'), {
      bootstrapConcluido: true,
      criadoPor: uid,
      criadoEm: serverTimestamp(),
    });

    lote.set(doc(db, 'configuracoes', 'empresa'), {
      nomeFantasia: 'Minha Assistência Técnica',
      garantiaPadraoDias: 90,
      atualizadoEm: serverTimestamp(),
    });

    lote.set(doc(db, 'configuracoes', 'contadorOS'), {
      ultimoNumero: 0,
      atualizadoEm: serverTimestamp(),
    });

    await lote.commit();
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro('');

    if (!nome.trim()) {
      setErro('Informe o nome do administrador.');
      return;
    }

    setSalvando(true);
    try {
      if (usuarioAutenticado) {
        const emailAdministrador = usuarioAutenticado.email;
        if (!emailAdministrador) {
          throw new Error('O usuário autenticado não possui e-mail válido.');
        }

        await gravarConfiguracaoInicial(usuarioAutenticado.uid, emailAdministrador);
      } else {
        if (senha.length < 6) {
          setErro('A senha deve ter pelo menos 6 caracteres.');
          return;
        }
        if (senha !== confirmacao) {
          setErro('As senhas não conferem.');
          return;
        }

        const credencial = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        await gravarConfiguracaoInicial(credencial.user.uid, email.trim());
      }

      aoConcluir();
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : 'Erro desconhecido.';
      setErro(`Não foi possível concluir a configuração: ${mensagem}`);
    } finally {
      setSalvando(false);
    }
  };

  const possuiUsuarioAutenticado = Boolean(usuarioAutenticado);

  return (
    <div className="auth-shell">
      <section className="auth-card auth-wide">
        <div className="auth-logo"><Wrench size={29} /></div>
        <span className="auth-kicker">CONFIGURAÇÃO INICIAL</span>
        <h1>{possuiUsuarioAutenticado ? 'Conclua a liberação do administrador' : 'Crie o administrador da loja'}</h1>
        <p>
          {possuiUsuarioAutenticado
            ? 'Este e-mail já existe no Firebase Authentication, mas ainda não possui perfil no sistema. Ao concluir, ele será liberado como administrador.'
            : 'Este primeiro usuário terá acesso total. Depois, os demais usuários serão cadastrados pelo menu de usuários.'}
        </p>
        <form className="form-grid" onSubmit={enviar}>
          <label className="field field-full">
            <span>Nome do administrador</span>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
          </label>

          {possuiUsuarioAutenticado ? (
            <label className="field field-full">
              <span>E-mail autenticado</span>
              <input value={usuarioAutenticado?.email ?? ''} readOnly disabled />
            </label>
          ) : (
            <>
              <label className="field">
                <span>E-mail</span>
                <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@loja.com" />
              </label>
              <label className="field">
                <span>Senha</span>
                <input required type="password" minLength={6} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </label>
              <label className="field field-full">
                <span>Confirmar senha</span>
                <input required type="password" minLength={6} autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
              </label>
            </>
          )}

          {erro && <div className="form-error field-full">{erro}</div>}
          <button className="button button-primary field-full" disabled={salvando}>
            <ShieldCheck size={18} />
            {salvando
              ? 'Configurando...'
              : possuiUsuarioAutenticado
                ? 'Concluir configuração e liberar acesso'
                : 'Criar administrador e iniciar sistema'}
          </button>

          {!possuiUsuarioAutenticado && (
            <button type="button" className="button button-secondary field-full" onClick={aoEntrarComUsuarioExistente}>
              Já possuo um usuário administrador
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
