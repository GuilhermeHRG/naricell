import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

// Compatibilidade temporária com chamadas antigas.
// O empresaId é ignorado porque a versão atual usa coleções globais.
export function empresaDoc(_empresaId: string, primeiroSegmento: string, ...outrosSegmentos: string[]) {
  return doc(db, primeiroSegmento, ...outrosSegmentos);
}

export function empresaCollection(_empresaId: string, nome: string) {
  return collection(db, nome);
}

export function empresaSubcollection(
  _empresaId: string,
  colecao: string,
  documentoId: string,
  subcolecao: string,
) {
  return collection(db, colecao, documentoId, subcolecao);
}

export function empresaSubDoc(
  _empresaId: string,
  colecao: string,
  documentoId: string,
  subcolecao: string,
  subDocumentoId: string,
) {
  return doc(db, colecao, documentoId, subcolecao, subDocumentoId);
}

export function empresaPath(_empresaId: string, ...partes: string[]) {
  return partes as readonly string[];
}
