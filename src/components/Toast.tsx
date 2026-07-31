import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; kind: ToastKind }
interface ToastContextValue { showToast: (message: string, kind?: ToastKind) => void }
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const showToast = (message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((atual) => [...atual, { id, message, kind }]);
    window.setTimeout(() => setItems((atual) => atual.filter((item) => item.id !== id)), 4200);
  };
  const value = useMemo(() => ({ showToast }), []);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite">
        {items.map((item) => <div className={`toast toast-${item.kind}`} key={item.id}>{item.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error('useToast deve ser usado dentro de ToastProvider.');
  return contexto;
}
