-- ============================================================================
-- fotos_evidencia.projeto_id — vínculo direto com o dispositivo
--
-- POR QUE
--
-- `fotos_evidencia` só tem vínculo com diario_obra_id / atividade_id /
-- elemento_visual_id, e os três são mutuamente exclusivos (só um preenchido
-- por foto — constraint fotos_evidencia_vinculo_obrigatorio já garante ao
-- menos um). Filtrar fotos por dispositivo exigiria resolver o projeto via um
-- desses três caminhos toda vez. Um projeto_id direto evita essa ambiguidade.
--
-- Backfill: resolve o projeto pelo vínculo que a foto já tem — diário → seu
-- projeto_id; atividade → grupo_macro → projeto_id; elemento visual → seu
-- projeto_id (já preenchido pela migration anterior). Como hoje só existe um
-- projeto no banco, todo resultado aponta para ele — nenhuma query atual muda
-- de resultado.
-- ============================================================================

alter table public.fotos_evidencia
  add column if not exists projeto_id uuid references public.projetos (id) on delete cascade;

update public.fotos_evidencia f
   set projeto_id = coalesce(
     (select d.projeto_id
        from public.diario_obra d
       where d.id = f.diario_obra_id),
     (select gm.projeto_id
        from public.atividades a
        join public.grupos_macro gm on gm.id = a.grupo_macro_id
       where a.id = f.atividade_id),
     (select ev.projeto_id
        from public.elementos_visuais ev
       where ev.id = f.elemento_visual_id)
   )
 where f.projeto_id is null;

alter table public.fotos_evidencia
  alter column projeto_id set not null;

comment on column public.fotos_evidencia.projeto_id is
  'Dispositivo (projeto) a que a foto pertence. Vínculo direto — evita ter que resolver via diario_obra_id/atividade_id/elemento_visual_id, que são mutuamente exclusivos.';

create index if not exists idx_fotos_evidencia_projeto on public.fotos_evidencia (projeto_id);
