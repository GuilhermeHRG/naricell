import { onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export function useFirestoreList<T>(consulta: Query, deps: unknown[] = []) {
  const [dados, setDados] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setCarregando(true);
    const cancelar = onSnapshot(
      consulta,
      (snapshot) => {
        setDados(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
        setErro(null);
        setCarregando(false);
      },
      (falha) => {
        setErro(falha.message);
        setCarregando(false);
      },
    );
    return cancelar;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { dados, carregando, erro };
}
