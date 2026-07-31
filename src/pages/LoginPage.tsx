import { KeyRound, LogIn, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(''); setMensagem(''); setEnviando(true);
    try { await login(email, senha); }
    catch { setErro('E-mail ou senha inválidos.'); }
    finally { setEnviando(false); }
  };

  const recuperar = async () => {
    setErro(''); setMensagem('');
    if (!email.trim()) return setErro('Informe seu e-mail para receber a recuperação de senha.');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMensagem('E-mail de recuperação enviado. Verifique sua caixa de entrada.');
    } catch { setErro('Não foi possível enviar o e-mail de recuperação.'); }
  };

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo"><Wrench size={29} /></div>
        <span className="auth-kicker">SISTEMA DE GESTÃO</span>
        <h1>Bem-vindo de volta</h1>
        <p>Acesse para gerenciar clientes, estoque, ordens de serviço e financeiro.</p>
        <form className="form-stack" onSubmit={entrar}>
          <label className="field"><span>E-mail</span><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@loja.com" /></label>
          <label className="field"><span>Senha</span><input required type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha" /></label>
          {erro && <div className="form-error">{erro}</div>}
          {mensagem && <div className="form-success">{mensagem}</div>}
          <button className="button button-primary" disabled={enviando}><LogIn size={18} />{enviando ? 'Entrando...' : 'Entrar no sistema'}</button>
          <button className="button button-text" type="button" onClick={() => void recuperar()}><KeyRound size={16} />Esqueci minha senha</button>
        </form>
      </section>
    </div>
  );
}
