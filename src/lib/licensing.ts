import type { LicencaSistema, TimestampValue } from '../types';

export const MASTER_EMAIL = (import.meta.env.VITE_MASTER_EMAIL ?? 'guilhermeg.dev@gmail.com').trim().toLowerCase();
export const LICENCA_DOC_ID = 'status';
export const LICENCA_GESTAO_DOC_ID = 'gestao';

export function isMasterEmail(email?: string | null) {
  return email?.trim().toLowerCase() === MASTER_EMAIL;
}

function toDate(value?: TimestampValue) {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export function licencaEstaAtiva(licenca: LicencaSistema | null | undefined) {
  if (!licenca?.ativo) return false;
  const venceEm = toDate(licenca.venceEm);
  return Boolean(venceEm && venceEm.getTime() >= Date.now());
}

export function dataLicencaInput(value?: TimestampValue) {
  const data = toDate(value);
  if (!data) return '';
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function dataFimDoDia(valor: string) {
  return valor ? new Date(`${valor}T23:59:59.999`) : new Date();
}
