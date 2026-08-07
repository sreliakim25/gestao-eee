/**
 * lib/concretagem — Regras de negócio do módulo de Concretagem.
 *
 * Dono: agente `concretagem-orcamento`.
 * Tudo aqui é puro e testável: sem I/O, sem React, sem Supabase.
 *
 * Índice:
 *  - `tipos.ts`      tipos do domínio
 *  - `plano.ts`      as 4 etapas do Plano_Execucao_Concretagem_EEE.docx
 *  - `checklist.ts`  checklist técnico pré-concretagem
 *  - `pedido.ts`     mínimo de 5 m³, caminhões/sobra e combinação de sobras
 *  - `status.ts`     planejado → pedido → confirmado → concretado
 *  - `mapeamento.ts` Row do banco ↔ tipo do domínio
 */

export * from './tipos';
export * from './plano';
export * from './checklist';
export * from './pedido';
export * from './status';
export * from './mapeamento';
