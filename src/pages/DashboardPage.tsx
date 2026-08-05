import { getDocs, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  ClipboardList,
  PackagePlus,
  PackageSearch,
  PlusCircle,
  ReceiptText,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PageKey } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { empresaCollection } from '../lib/tenant';
import { moeda } from '../lib/utils';
import type { ContaReceber, OrdemServico, Produto } from '../types';

interface DashboardProps {
  irPara: (pagina: PageKey) => void;
}

const STATUS_OS_FINALIZADA = ['ENTREGUE', 'CANCELADA', 'SEM_CONSERTO'];

const PERFIS_FINANCEIROS = ['ADMIN', 'ATENDENTE'];

export function DashboardPage({ irPara }: DashboardProps) {
  const auth = useAuth() as any;

  const empresaId = auth?.empresaId as string | undefined;

  const perfil =
    auth?.perfil ??
    auth?.usuario?.perfil ??
    auth?.acesso?.perfil ??
    '';

  const podeVerFinanceiro = PERFIS_FINANCEIROS.includes(String(perfil).toUpperCase());

  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDashboard, setErroDashboard] = useState('');

  useEffect(() => {
    let cancelado = false;

    const carregarOrdens = async (idEmpresa: string) => {
      const snapshot = await getDocs(empresaCollection(idEmpresa, 'ordensServico'));

      if (!cancelado) {
        setOrdens(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as OrdemServico)));
      }
    };

    const carregarProdutos = async (idEmpresa: string) => {
      const snapshot = await getDocs(empresaCollection(idEmpresa, 'produtos'));

      if (!cancelado) {
        setProdutos(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Produto)));
      }
    };

    const carregarContas = async (idEmpresa: string) => {
      if (!podeVerFinanceiro) {
        if (!cancelado) {
          setContas([]);
        }
        return;
      }

      const snapshot = await getDocs(
        query(
          empresaCollection(idEmpresa, 'contasReceber'),
          where('status', 'in', ['ABERTA', 'PARCIAL']),
        ),
      );

      if (!cancelado) {
        setContas(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ContaReceber)));
      }
    };

    const carregar = async () => {
      if (!empresaId) {
        setCarregando(false);
        return;
      }

      setCarregando(true);
      setErroDashboard('');

      const erros: string[] = [];

      await Promise.allSettled([
        carregarOrdens(empresaId).catch((error) => {
          console.error('Erro ao carregar ordens no dashboard:', error);
          erros.push('ordens');
        }),

        carregarProdutos(empresaId).catch((error) => {
          console.error('Erro ao carregar produtos no dashboard:', error);
          erros.push('produtos');
        }),

        carregarContas(empresaId).catch((error) => {
          console.error('Erro ao carregar contas no dashboard:', error);
          erros.push('financeiro');
        }),
      ]);

      if (!cancelado) {
        if (erros.length > 0) {
          setErroDashboard(
            `Algumas informações do dashboard não puderam ser carregadas: ${erros.join(', ')}.`,
          );
        }

        setCarregando(false);
      }
    };

    void carregar();

    return () => {
      cancelado = true;
    };
  }, [empresaId, podeVerFinanceiro]);

  const emAndamento = useMemo(
    () => ordens.filter((os) => !STATUS_OS_FINALIZADA.includes(os.status)).length,
    [ordens],
  );

  const estoqueBaixo = useMemo(
    () =>
      produtos.filter((produto) => {
        const ativo = produto.ativo !== false;
        const estoqueAtual = Number(produto.estoqueAtual || 0);
        const estoqueMinimo = Number(produto.estoqueMinimo || 0);

        return ativo && estoqueAtual <= estoqueMinimo;
      }).length,
    [produtos],
  );

  const valorReceber = useMemo(
    () => contas.reduce((total, conta) => total + Number(conta.valorAberto || 0), 0),
    [contas],
  );

  return (
    <div className="dashboard dashboard-clean">
      <section className="page-heading page-heading-clean">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>
          <h2>Bom trabalho. Por onde você quer começar?</h2>
        </div>

        <button className="button button-primary button-prominent" onClick={() => irPara('ordens')}>
          <PlusCircle size={19} />
          Nova OS
        </button>
      </section>

      {erroDashboard && (
        <div className="alert alert-warning">
          {erroDashboard}
        </div>
      )}

      <section className="quick-actions quick-actions-clean" aria-label="Atalhos principais">
        <button className="quick-action" onClick={() => irPara('ordens')}>
          <span className="quick-action-icon icon-blue">
            <ClipboardList size={22} />
          </span>
          <span>
            <strong>Abrir OS</strong>
            <small>Receber aparelho</small>
          </span>
          <ArrowRight size={17} />
        </button>

        <button className="quick-action" onClick={() => irPara('clientes')}>
          <span className="quick-action-icon icon-violet">
            <UserPlus size={22} />
          </span>
          <span>
            <strong>Novo cliente</strong>
            <small>Cadastrar rapidamente</small>
          </span>
          <ArrowRight size={17} />
        </button>

        <button className="quick-action" onClick={() => irPara('produtos')}>
          <span className="quick-action-icon icon-amber">
            <PackagePlus size={22} />
          </span>
          <span>
            <strong>Nova peça</strong>
            <small>Produto e estoque</small>
          </span>
          <ArrowRight size={17} />
        </button>

        <button className="quick-action" onClick={() => irPara('servicos')}>
          <span className="quick-action-icon icon-green">
            <Wrench size={22} />
          </span>
          <span>
            <strong>Novo serviço</strong>
            <small>Reparo e garantia</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </section>

      <section className="stats-grid stats-grid-clean">
        <article className="stat-card stat-card-blue">
          <div className="stat-icon blue">
            <ClipboardList size={20} />
          </div>
          <div>
            <span>OS em andamento</span>
            <strong>{carregando ? '—' : emAndamento}</strong>
          </div>
        </article>

        <article className="stat-card stat-card-amber">
          <div className="stat-icon amber">
            <PackageSearch size={20} />
          </div>
          <div>
            <span>Peças para repor</span>
            <strong>{carregando ? '—' : estoqueBaixo}</strong>
          </div>
        </article>

        {podeVerFinanceiro && (
          <article className="stat-card stat-card-violet">
            <div className="stat-icon purple">
              <ReceiptText size={20} />
            </div>
            <div>
              <span>Valor a receber</span>
              <strong className="currency-stat">{carregando ? '—' : moeda(valorReceber)}</strong>
            </div>
          </article>
        )}
      </section>

      <section className="dashboard-focus-panel">
        <div className="dashboard-focus-copy">
          <span>PRÓXIMOS PASSOS</span>
          <strong>Cadastre o cliente, abra a OS e inclua somente as peças ou serviços usados.</strong>
          <small>O sistema faz o total e a baixa de estoque quando a OS for concluída.</small>
        </div>

        <div className="dashboard-focus-actions">
          <button className="button button-secondary" onClick={() => irPara('ordens')}>
            Ver ordens
          </button>

          <button className="button button-secondary" onClick={() => irPara('estoque')}>
            Ver estoque
          </button>
        </div>
      </section>
    </div>
  );
}
