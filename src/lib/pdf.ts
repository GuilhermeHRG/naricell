import type { Cliente, ConfiguracaoEmpresa, OrdemServico, OrdemServicoItem } from '../types';
import { dataBr, moeda, statusLabel } from './utils';

const COR_PRIMARIA: [number, number, number] = [37, 160, 242];
const COR_PRIMARIA_ESCURO: [number, number, number] = [20, 124, 209];
const COR_TEXTO: [number, number, number] = [28, 36, 44];
const COR_MUTED: [number, number, number] = [102, 112, 122];
const COR_BORDA: [number, number, number] = [210, 223, 235];
const COR_CAIXA: [number, number, number] = [247, 251, 255];

const TERMO_CIENCIA = 'Declaro estar ciente das condições: Não nos responsabilizamos por aparelhos oxidados ou com defeitos ocasionados por mau uso do cliente; o aparelho será entregue mediante a entrega do protocolo; apenas será analisado o defeito constante no item “defeito”; aparelhos não retirados no período superior a 90 dias serão vendidos pelo preço de reparo ou desmontados; a garantia de nossa assistência é de 90 dias no reparo efetuado; após o vencimento será cobrada taxa de permanência do aparelho na loja.';

async function carregarImagemDataUrl(src?: string) {
  if (!src) return null;
  try {
    const resposta = await fetch(src);
    const blob = await resposta.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function desenharCaixa(
  pdf: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  titulo: string,
  linhas: string[],
) {
  pdf.setDrawColor(...COR_BORDA);
  pdf.setFillColor(...COR_CAIXA);
  pdf.roundedRect(x, y, w, h, 2, 2, 'FD');
  pdf.setTextColor(...COR_PRIMARIA_ESCURO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.text(titulo.toUpperCase(), x + 2.5, y + 4.2);
  pdf.setTextColor(...COR_TEXTO);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.55);
  let linhaY = y + 8.2;
  for (const linha of linhas) {
    const partes = pdf.splitTextToSize(linha || '-', w - 5);
    pdf.text(partes, x + 2.5, linhaY);
    linhaY += partes.length * 3.05 + 0.55;
  }
}

function desenharGradePadraoCompacta(
  pdf: import('jspdf').jsPDF,
  ordem: OrdemServico,
  x: number,
  y: number,
) {
  const gap = 7.2;
  const raio = 1.45;
  const pontos = Array.from({ length: 9 }, (_, idx) => {
    const coluna = idx % 3;
    const linha = Math.floor(idx / 3);
    return { id: idx + 1, x: x + coluna * gap, y: y + linha * gap };
  });

  const selecionados = ordem.tipoBloqueio === 'PADRAO' ? (ordem.padraoBloqueio ?? []) : [];
  pdf.setDrawColor(...COR_PRIMARIA);
  pdf.setLineWidth(0.45);

  if (selecionados.length > 1) {
    for (let i = 0; i < selecionados.length - 1; i += 1) {
      const atual = pontos.find((p) => p.id === selecionados[i]);
      const proximo = pontos.find((p) => p.id === selecionados[i + 1]);
      if (atual && proximo) pdf.line(atual.x, atual.y, proximo.x, proximo.y);
    }
  }

  for (const ponto of pontos) {
    const indice = selecionados.indexOf(ponto.id);
    if (indice >= 0) {
      pdf.setFillColor(...COR_PRIMARIA);
      pdf.circle(ponto.x, ponto.y, raio, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(4.8);
      pdf.text(String(indice + 1), ponto.x, ponto.y + 1.15, { align: 'center' });
    } else {
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(...COR_PRIMARIA);
      pdf.circle(ponto.x, ponto.y, raio, 'FD');
    }
  }
  pdf.setTextColor(...COR_TEXTO);
}

function desenharRodapeAssinaturasETermo(
  pdf: import('jspdf').jsPDF,
  y: number,
  larguraPagina: number,
  alturaPagina: number,
  margem: number,
  larguraUtil: number,
  empresa: ConfiguracaoEmpresa,
) {
  const linhasTermo = pdf.splitTextToSize(TERMO_CIENCIA, larguraUtil - 5);
  const alturaNecessaria = 7 + 7 + linhasTermo.length * 2.25 + 8;
  let inicio = y;

  if (inicio + alturaNecessaria > alturaPagina - 5) {
    pdf.addPage('a5', 'portrait');
    inicio = 10;
    pdf.setFillColor(...COR_PRIMARIA);
    pdf.roundedRect(margem, 7, larguraUtil, 8, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('ORDEM DE SERVIÇO — CONTINUAÇÃO', margem + 3, 12.2);
    inicio = 20;
  }

  pdf.setDrawColor(...COR_BORDA);
  pdf.setLineWidth(0.25);
  pdf.line(margem, inicio, margem + 55, inicio);
  pdf.line(larguraPagina - margem - 55, inicio, larguraPagina - margem, inicio);
  pdf.setTextColor(...COR_TEXTO);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.2);
  pdf.text('Assinatura do cliente', margem + 27.5, inicio + 3.8, { align: 'center' });
  pdf.text('Assinatura do responsável', larguraPagina - margem - 27.5, inicio + 3.8, { align: 'center' });

  const termoY = inicio + 7;
  const termoAltura = linhasTermo.length * 2.25 + 5.5;
  pdf.setDrawColor(...COR_BORDA);
  pdf.setFillColor(252, 254, 255);
  pdf.roundedRect(margem, termoY, larguraUtil, termoAltura, 1.6, 1.6, 'FD');
  pdf.setTextColor(...COR_MUTED);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(5.25);
  pdf.text('DECLARAÇÃO DE CIÊNCIA', margem + 2.3, termoY + 3.2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(4.85);
  pdf.text(linhasTermo, margem + 2.3, termoY + 5.8);

  pdf.setFontSize(5.1);
  pdf.setTextColor(...COR_MUTED);
  pdf.text(empresa.endereco || empresa.telefone || empresa.email || '', larguraPagina / 2, alturaPagina - 4, { align: 'center' });
}

export async function gerarPdfOrdemServico(
  ordem: OrdemServico,
  cliente: Cliente | undefined,
  itens: OrdemServicoItem[],
  empresa: ConfiguracaoEmpresa,
) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const margem = 7;
  const larguraUtil = larguraPagina - margem * 2;
  const dataUrlLogo = await carregarImagemDataUrl(empresa.logoUrl || '/logo-naricell.jpg');

  const valorServicos = itens.filter((item) => item.tipo === 'SERVICO').reduce((soma, item) => soma + Number(item.valorTotal || 0), 0);
  const valorProdutos = itens.filter((item) => item.tipo === 'PRODUTO').reduce((soma, item) => soma + Number(item.valorTotal || 0), 0);
  const valorTotal = Math.max(0, valorServicos + valorProdutos - Number(ordem.desconto || 0));

  pdf.setFillColor(...COR_PRIMARIA);
  pdf.roundedRect(margem, margem, larguraUtil, 18, 3, 3, 'F');

  if (dataUrlLogo) {
    try {
      pdf.addImage(dataUrlLogo, 'JPEG', margem + 2.5, margem + 2.1, 17, 13.8);
    } catch {
      // A geração do PDF continua mesmo que a logo não seja carregada.
    }
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.2);
  pdf.text(empresa.nomeFantasia || 'Assistência Técnica', dataUrlLogo ? margem + 23 : margem + 3, margem + 6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.7);
  pdf.text('ORDEM DE SERVIÇO', dataUrlLogo ? margem + 23 : margem + 3, margem + 11.2);
  pdf.text(`Nº ${String(ordem.numero).padStart(5, '0')}`, larguraPagina - margem - 2.5, margem + 6.5, { align: 'right' });
  pdf.text(`Data: ${dataBr(ordem.criadoEm)}`, larguraPagina - margem - 2.5, margem + 11.2, { align: 'right' });

  let y = margem + 21;
  const gap = 3;
  const colW = (larguraUtil - gap) / 2;

  desenharCaixa(pdf, margem, y, colW, 23, 'Cliente', [
    `Nome: ${cliente?.nome || ordem.clienteNome}`,
    `Tel.: ${cliente?.whatsapp || cliente?.telefone || '-'}`,
    `Doc.: ${cliente?.cpfCnpj || '-'}`,
  ]);

  desenharCaixa(pdf, margem + colW + gap, y, colW, 23, 'Aparelho', [
    `${ordem.aparelhoMarca} ${ordem.aparelhoModelo}${ordem.aparelhoCor ? ` · ${ordem.aparelhoCor}` : ''}`,
    `IMEI: ${ordem.aparelhoImei || '-'}`,
    `Acessórios: ${ordem.acessorios || 'Não informado'}`,
  ]);

  y += 26;

  desenharCaixa(pdf, margem, y, colW, 22, 'Atendimento', [
    `Status: ${statusLabel(ordem.status)}`,
    `Técnico: ${ordem.tecnicoNome || 'Não definido'}`,
    `Prev.: ${dataBr(ordem.previsaoEntrega)} · Garantia: ${ordem.garantiaDias} dias`,
  ]);

  pdf.setDrawColor(...COR_BORDA);
  pdf.setFillColor(...COR_CAIXA);
  pdf.roundedRect(margem + colW + gap, y, colW, 22, 2, 2, 'FD');
  pdf.setTextColor(...COR_PRIMARIA_ESCURO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.text('RESUMO FINANCEIRO', margem + colW + gap + 2.5, y + 4.2);
  pdf.setTextColor(...COR_TEXTO);
  pdf.setFontSize(6.8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Serviços: ${moeda(valorServicos)}`, margem + colW + gap + 2.5, y + 9);
  pdf.text(`Peças: ${moeda(valorProdutos)}`, margem + colW + gap + 2.5, y + 13);
  pdf.text(`Desc.: ${moeda(ordem.desconto)}`, margem + colW + gap + 2.5, y + 17);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.6);
  pdf.text(`TOTAL: ${moeda(valorTotal)}`, margem + colW + gap + colW - 2.5, y + 17, { align: 'right' });

  y += 25;

  const defeitoW = 86;
  const bloqueioW = larguraUtil - defeitoW - gap;
  const defeitoLinhas = pdf.splitTextToSize(ordem.defeitoRelatado || '-', defeitoW - 5);
  const diagnosticoLinhas = pdf.splitTextToSize(ordem.diagnostico || 'Não informado', defeitoW - 5);
  // A grade possui três linhas de pontos; a altura mínima evita cortar a última linha.
  const alturaTexto = Math.max(41, defeitoLinhas.length * 3.1 + diagnosticoLinhas.length * 3.1 + 13);

  pdf.setDrawColor(...COR_BORDA);
  pdf.setFillColor(...COR_CAIXA);
  pdf.roundedRect(margem, y, defeitoW, alturaTexto, 2, 2, 'FD');
  pdf.setTextColor(...COR_PRIMARIA_ESCURO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.text('DEFEITO / DIAGNÓSTICO', margem + 2.5, y + 4.2);
  pdf.setTextColor(...COR_TEXTO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.text('Defeito:', margem + 2.5, y + 8.8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(defeitoLinhas, margem + 2.5, y + 12);
  const yDiagnostico = y + 12 + defeitoLinhas.length * 3.05 + 1.5;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Diagnóstico:', margem + 2.5, yDiagnostico);
  pdf.setFont('helvetica', 'normal');
  pdf.text(diagnosticoLinhas, margem + 2.5, yDiagnostico + 3.15);

  pdf.setDrawColor(...COR_BORDA);
  pdf.setFillColor(...COR_CAIXA);
  pdf.roundedRect(margem + defeitoW + gap, y, bloqueioW, alturaTexto, 2, 2, 'FD');
  pdf.setTextColor(...COR_PRIMARIA_ESCURO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.text('BLOQUEIO / PADRÃO', margem + defeitoW + gap + 2.5, y + 4.2);
  pdf.setTextColor(...COR_TEXTO);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.6);
  const tipoBloqueio = ordem.tipoBloqueio || 'NENHUM';
  pdf.text(`Tipo: ${tipoBloqueio}`, margem + defeitoW + gap + 2.5, y + 8.8);
  if (ordem.codigoBloqueio) pdf.text(`Código: ${ordem.codigoBloqueio}`, margem + defeitoW + gap + 2.5, y + 12.5);
  const gradeX = margem + defeitoW + gap + (bloqueioW - 14.4) / 2;
  desenharGradePadraoCompacta(pdf, ordem, gradeX, y + 16.5);

  y += alturaTexto + 3;

  autoTable(pdf, {
    startY: y,
    margin: { left: margem, right: margem },
    head: [['Tipo', 'Descrição', 'Qtd.', 'Unit.', 'Total']],
    body: itens.length > 0
      ? itens.map((item) => [
          item.tipo === 'PRODUTO' ? 'Prod.' : 'Serv.',
          item.descricao,
          String(item.quantidade),
          moeda(item.valorUnitario),
          moeda(item.valorTotal),
        ])
      : [['-', 'Nenhum item lançado', '-', '-', moeda(0)]],
    theme: 'grid',
    styles: { fontSize: 6.2, cellPadding: 1.5, textColor: COR_TEXTO },
    headStyles: { fillColor: COR_PRIMARIA, fontSize: 6.5, halign: 'left' },
    alternateRowStyles: { fillColor: [252, 254, 255] },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 62 },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 19, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
    },
  });

  const finalY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 24;
  desenharRodapeAssinaturasETermo(pdf, finalY + 6, larguraPagina, alturaPagina, margem, larguraUtil, empresa);
  pdf.save(`OS-${String(ordem.numero).padStart(5, '0')}.pdf`);
}
