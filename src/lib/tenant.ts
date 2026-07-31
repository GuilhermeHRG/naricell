import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

// Compatibilidade temporária: o primeiro parâmetro é ignorado.
// Todos os dados agora ficam em coleções globais, sem multiempresa.
export function empresaDoc(_empresaId: string, ...partes: string[]) {
  return doc(db, ...partes);
}

export function empresaCollection(_empresaId: string, nome: string) {
  return collection(db, nome);
}

export function empresaSubcollection(_empresaId: string, colecao: string, documentoId: string, subcolecao: string) {
  return collection(db, colecao, documentoId, subcolecao);
}

export function empresaSubDoc(_empresaId: string, colecao: string, documentoId: string, subcolecao: string, subDocumentoId: string) {
  return doc(db, colecao, documentoId, subcolecao, subDocumentoId);
}

export function empresaPath(_empresaId: string, ...partes: string[]) {
  return partes as readonly string[];
}
