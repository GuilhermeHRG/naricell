import type { TimestampValue } from '../types';

export const moeda = (valor: number | undefined | null) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(valor || 0));

export const numero = (valor: number | undefined | null) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(valor || 0));

export const dataBr = (valor: TimestampValue | string | undefined) => {
  if (!valor) return '-';
  if (typeof valor === 'string') {
    const [ano, mes, dia] = valor.split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
  }
  const data = valor instanceof Date ? valor : valor.toDate();
  return data.toLocaleDateString('pt-BR');
};

export const dataHoraBr = (valor: TimestampValue | undefined) => {
  if (!valor) return '-';
  const data = valor instanceof Date ? valor : valor.toDate();
  return data.toLocaleString('pt-BR');
};

export const dataParaIsoLocal = (data: Date) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

export const hojeIso = () => dataParaIsoLocal(new Date());

export const timestampParaIsoLocal = (valor: TimestampValue | undefined) => {
  if (!valor) return '';
  const data = valor instanceof Date ? valor : valor.toDate();
  return dataParaIsoLocal(data);
};

export const normalizarTexto = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const statusLabel = (status: string) =>
  status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letra: string) => letra.toUpperCase());

export const gerarCodigoProduto = () => `P${Date.now().toString().slice(-7)}`;
