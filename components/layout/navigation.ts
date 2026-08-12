/**
 * components/layout/navigation.ts — catálogo dos módulos do app e quem enxerga cada um.
 *
 * Fonte única da navegação: módulo novo entra aqui, e não em `<Link>` soltos
 * espalhados pelas telas. A visibilidade espelha (sem substituir) a RLS do
 * banco — esconder um item é conveniência de UI; a segurança real está no
 * Postgres.
 */

import type { PerfilUsuarioEnum } from '@/types/database';

export interface AppModule {
  /** Rota do App Router. */
  href: string;
  /** Rótulo curto exibido na navegação. */
  label: string;
  /** Descrição usada em `title` e por leitores de tela. */
  description: string;
  /** Perfis que enxergam o módulo. Ausente = todos os perfis autenticados. */
  allowedProfiles?: readonly PerfilUsuarioEnum[];
}

/** Os módulos, na ordem em que a obra os usa. */
export const APP_MODULES: readonly AppModule[] = [
  {
    href: '/',
    label: 'Painel',
    description: 'Indicadores de topo: evolução física, prazo e frentes',
  },
  {
    href: '/cronograma',
    label: 'Cronograma',
    description: 'Atividades do Smartsheet com filtros e Gantt simplificado',
  },
  {
    href: '/curva-s',
    label: 'Curva S',
    description: 'Planejado x realizado acumulado por semana',
  },
  {
    href: '/lancamento',
    label: 'Lançamento',
    description: 'Registro do avanço físico semanal por atividade',
  },
  {
    href: '/gestao-visual',
    label: 'Gestão Visual',
    description: 'Planta esquemática da elevatória colorida por progresso',
  },
  {
    href: '/diario',
    label: 'Diário de Obra',
    description: 'RDO: clima, efetivo, equipamentos, ocorrências e fotos',
  },
  {
    href: '/concretagem',
    label: 'Concretagem',
    description: 'Etapas, volumes e checklist do plano de concretagem',
  },
  {
    href: '/orcamento',
    label: 'Orçamento',
    description: 'Contrato do terceirizado: orçado x medido',
    // Dado financeiro do contrato não é necessário para a equipe de campo.
    allowedProfiles: ['gestor', 'fiscal'],
  },
  {
    href: '/analise',
    label: 'Análise IA',
    description: 'Leitura automática dos indicadores: situação, riscos e recomendações',
    // Consolida o quadro inteiro da obra, incluindo risco de prazo.
    allowedProfiles: ['gestor', 'fiscal'],
  },
  {
    href: '/usuarios',
    label: 'Acessos',
    description: 'Liberar acesso e definir o perfil de cada pessoa',
    // Só gestor libera acesso — espelha a RLS de perfis.
    allowedProfiles: ['gestor'],
  },
  {
    href: '/conta',
    label: 'Minha conta',
    description: 'Dados de acesso e troca da própria senha',
  },
];

/** Módulos visíveis para um perfil. Sem perfil (deslogado) não vê nenhum. */
export function visibleModules(perfil: PerfilUsuarioEnum | null | undefined): AppModule[] {
  if (!perfil) return [];
  return APP_MODULES.filter(
    (modulo) => !modulo.allowedProfiles || modulo.allowedProfiles.includes(perfil),
  );
}

/** Rótulo humano do perfil, para o cabeçalho. */
export const PROFILE_LABELS: Record<PerfilUsuarioEnum, string> = {
  gestor: 'Gestor',
  fiscal: 'Fiscal',
  campo: 'Campo',
};

/** Pode registrar avanço semanal e RDO (espelha a RLS de escrita). */
export function canRegisterProduction(perfil: PerfilUsuarioEnum | null | undefined): boolean {
  return perfil === 'gestor' || perfil === 'fiscal' || perfil === 'campo';
}

/** Pode editar planejamento/cadastro — só gestor. */
export function canEditPlanning(perfil: PerfilUsuarioEnum | null | undefined): boolean {
  return perfil === 'gestor';
}

/** Rota ativa: '/' casa exato; as demais casam com o prefixo. */
export function isActiveRoute(href: string, currentPath: string): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
