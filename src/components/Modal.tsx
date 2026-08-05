import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  aberto: boolean;
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
  largura?: 'sm' | 'md' | 'lg' | 'xl';
  classe?: string;
}

export function Modal({ aberto, titulo, children, aoFechar, largura = 'md', classe = '' }: ModalProps) {
  useEffect(() => {
    if (!aberto) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className={`modal-backdrop ${classe ? `${classe}-backdrop` : ""}`.trim()} role="presentation" onMouseDown={aoFechar}>
      <section className={`modal modal-${largura} ${classe}`.trim()} role="dialog" aria-modal="true" onMouseDown={(evento) => evento.stopPropagation()}>
        <header className="modal-header">
          <h2>{titulo}</h2>
          <button className="icon-button" type="button" onClick={aoFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}
