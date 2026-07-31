import { CalendarX2, CircleAlert, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dataBr } from '../lib/utils';
import type { LicencaSistema } from '../types';

export function LicencaBloqueadaPage({ licenca }: { licenca: LicencaSistema | null }) {
  const { logout } = useAuth();
  const vencida = Boolean(licenca?.venceEm);
  return (
    <div className="auth-shell">
      <section className="auth-card error-card license-locked-card">
        {vencida ? <CalendarX2 size={42} /> : <CircleAlert size={42} />}
        <h1>Uso do sistema indisponível</h1>
        <p>
          {licenca?.ativo
            ? `A licença do sistema venceu em ${dataBr(licenca.venceEm)}.`
            : 'A licença do sistema está bloqueada ou ainda não foi liberada.'}
        </p>
        <p className="muted-text">Entre em contato com o fornecedor do sistema para regularizar a liberação de uso.</p>
        <button className="button button-secondary" onClick={() => void logout()}><LogOut size={16} />Sair</button>
      </section>
    </div>
  );
}
