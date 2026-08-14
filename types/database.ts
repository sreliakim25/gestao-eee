/**
 * types/database.ts — Tipos TypeScript do schema Postgres da EEE Novo Mundo.
 *
 * ATENÇÃO: este arquivo está escrito à mão porque o projeto Supabase ainda não
 * foi criado. Ele espelha fielmente as migrations em `supabase/migrations/`.
 * Toda alteração de schema exige atualizar este arquivo na mesma tarefa.
 *
 * Como regenerar quando o projeto Supabase existir (aí este arquivo passa a ser
 * gerado e não mais editado à mão):
 *
 *   # projeto remoto
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <ref-do-projeto> --schema public > types/database.ts
 *
 *   # ambiente local (supabase start)
 *   npx supabase gen types typescript --local --schema public > types/database.ts
 *
 * Depois de regenerar, reanexar manualmente o bloco "Tipos de conveniência"
 * do final do arquivo (o gerador não o produz).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Enums do banco (public.*). */
export type PerfilUsuarioEnum = 'gestor' | 'fiscal' | 'campo';

/** Liberação de acesso: quem se cadastra nasce `pendente`. */
export type StatusAcesso = 'pendente' | 'ativo' | 'bloqueado';

export type TipoElementoVisual =
  | 'poco_umido'
  | 'camara_grades'
  | 'casa_comando'
  | 'muro_perimetral'
  | 'pavimentacao'
  | 'caixa_comporta'
  | 'caixa_valvulas'
  | 'caixa_tanque_hidropneumatico'
  | 'caixa_medidor_vazao';

export type StatusPedidoConcretagem =
  | 'planejado'
  | 'pedido'
  | 'confirmado'
  | 'concretado';

export type CategoriaOrcamento =
  | 'servicos_preliminares'
  | 'estacao_elevatoria'
  | 'caixa_tanque_pneumatico'
  | 'casa_comando'
  | 'muro_externo'
  | 'sistema_diversos'
  | 'itens_omissos';

/** Faixa de progresso usada para colorir o SVG da Gestão Visual. */
export type FaixaProgresso = 'nao_iniciado' | 'em_andamento' | 'concluido';

export type Database = {
  public: {
    Tables: {
      ugbs: {
        Row: {
          id: string;
          nome: string;
          sigla: string;
          ordem: number;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          nome: string;
          sigla: string;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          sigla?: string;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [];
      };

      perfis: {
        Row: {
          id: string;
          nome: string;
          perfil: PerfilUsuarioEnum;
          status: StatusAcesso;
          liberado_em: string | null;
          liberado_por: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id: string;
          nome?: string;
          perfil?: PerfilUsuarioEnum;
          status?: StatusAcesso;
          liberado_em?: string | null;
          liberado_por?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          perfil?: PerfilUsuarioEnum;
          status?: StatusAcesso;
          liberado_em?: string | null;
          liberado_por?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [];
      };

      projetos: {
        Row: {
          id: string;
          /** UGB (Unidade de Gestão de Bacia) do dispositivo. NULL até o seed multi-dispositivo atribuir uma. */
          ugb_id: string | null;
          nome: string;
          cliente: string | null;
          data_inicio_planejada: string | null;
          data_fim_planejada: string | null;
          /** Rollup da linha raiz do Smartsheet (0–100). Percentual OFICIAL. */
          percentual_smartsheet: number | null;
          percentual_smartsheet_em: string | null;
          /** LEGADO: id da planilha principal. Ver projeto_planilhas_smartsheet. */
          smartsheet_sheet_id: string | null;
          /** LEGADO: último sync da planilha principal. Ver projeto_planilhas_smartsheet. */
          smartsheet_sincronizado_em: string | null;
          /** true = aba Concretagem aparece para este dispositivo. */
          modulo_concretagem_habilitado: boolean;
          /** true = aba Orçamento aparece para este dispositivo. */
          modulo_orcamento_habilitado: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          ugb_id?: string | null;
          nome: string;
          cliente?: string | null;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          percentual_smartsheet?: number | null;
          percentual_smartsheet_em?: string | null;
          smartsheet_sheet_id?: string | null;
          smartsheet_sincronizado_em?: string | null;
          modulo_concretagem_habilitado?: boolean;
          modulo_orcamento_habilitado?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          ugb_id?: string | null;
          nome?: string;
          cliente?: string | null;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          percentual_smartsheet?: number | null;
          percentual_smartsheet_em?: string | null;
          smartsheet_sheet_id?: string | null;
          smartsheet_sincronizado_em?: string | null;
          modulo_concretagem_habilitado?: boolean;
          modulo_orcamento_habilitado?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projetos_ugb_id_fkey';
            columns: ['ugb_id'];
            referencedRelation: 'ugbs';
            referencedColumns: ['id'];
          },
        ];
      };

      projeto_planilhas_smartsheet: {
        Row: {
          id: string;
          projeto_id: string;
          sheet_id: string;
          /** Ex.: 'principal', 'RAP', 'REL'. "principal" dita o rollup de % e as datas do dispositivo. */
          papel: string;
          ativo: boolean;
          ultimo_sincronizado_em: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          sheet_id: string;
          papel?: string;
          ativo?: boolean;
          ultimo_sincronizado_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          sheet_id?: string;
          papel?: string;
          ativo?: boolean;
          ultimo_sincronizado_em?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projeto_planilhas_smartsheet_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };

      grupos_macro: {
        Row: {
          id: string;
          projeto_id: string;
          /** Rótulo legível exibido na UI. */
          nome: string;
          /** Nome exato do nível 1 no .xlsx do Smartsheet — chave de casamento do import. */
          nome_smartsheet: string;
          /** Rollup da linha de nível 1 no Smartsheet (0–100). NULL = sem apontamento. */
          percentual_smartsheet: number | null;
          ordem: number;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          nome: string;
          nome_smartsheet: string;
          percentual_smartsheet?: number | null;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          nome?: string;
          nome_smartsheet?: string;
          percentual_smartsheet?: number | null;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'grupos_macro_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };

      elementos_visuais: {
        Row: {
          id: string;
          /** Dispositivo (projeto) a que o elemento visual pertence. */
          projeto_id: string;
          nome: string;
          tipo: TipoElementoVisual;
          svg_path_id: string;
          ifc_global_id: string | null;
          ordem: number;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          nome: string;
          tipo: TipoElementoVisual;
          svg_path_id: string;
          ifc_global_id?: string | null;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          nome?: string;
          tipo?: TipoElementoVisual;
          svg_path_id?: string;
          ifc_global_id?: string | null;
          ordem?: number;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'elementos_visuais_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };

      historico_cronograma: {
        Row: {
          id: string;
          projeto_id: string;
          /** Dia a que o registro se refere. Único por projeto. */
          data_referencia: string;
          data_inicio_planejada: string | null;
          data_fim_planejada: string | null;
          /** Coluna gerada no banco a partir das datas. */
          duracao_dias: number | null;
          percentual_smartsheet: number | null;
          total_atividades: number;
          atividades_criticas: number;
          atividades_concluidas: number;
          origem: 'sync' | 'import' | 'manual';
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          data_referencia: string;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          percentual_smartsheet?: number | null;
          total_atividades?: number;
          atividades_criticas?: number;
          atividades_concluidas?: number;
          origem?: 'sync' | 'import' | 'manual';
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          data_referencia?: string;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          percentual_smartsheet?: number | null;
          total_atividades?: number;
          atividades_criticas?: number;
          atividades_concluidas?: number;
          origem?: 'sync' | 'import' | 'manual';
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'historico_cronograma_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };

      atividades: {
        Row: {
          id: string;
          grupo_macro_id: string;
          elemento_visual_id: string | null;
          wbs_nivel: number;
          /** Nome curto exibido na UI (último segmento do caminho_wbs). Não é único. */
          nome: string;
          /** Caminho WBS completo dentro do grupo macro, unido por " > ". Chave de upsert. */
          caminho_wbs: string;
          /** true = folha do WBS. false = linha-mãe (não entra em média de evolução). */
          eh_folha: boolean;
          /** rowId da API do Smartsheet — chave de upsert estável. NULL se veio do .xlsx. */
          smartsheet_row_id: string | null;
          predecessores: string | null;
          duracao_dias: number | null;
          data_inicio_planejada: string | null;
          data_fim_planejada: string | null;
          /** Linha de base congelada por trigger — o sync não sobrescreve. */
          data_inicio_linha_base: string | null;
          data_fim_linha_base: string | null;
          percentual_concluido: number;
          caminho_critico: boolean;
          folga_dias: number | null;
          recurso: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          grupo_macro_id: string;
          elemento_visual_id?: string | null;
          wbs_nivel?: number;
          nome: string;
          caminho_wbs: string;
          eh_folha?: boolean;
          smartsheet_row_id?: string | null;
          predecessores?: string | null;
          duracao_dias?: number | null;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          data_inicio_linha_base?: string | null;
          data_fim_linha_base?: string | null;
          percentual_concluido?: number;
          caminho_critico?: boolean;
          folga_dias?: number | null;
          recurso?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          grupo_macro_id?: string;
          elemento_visual_id?: string | null;
          wbs_nivel?: number;
          nome?: string;
          caminho_wbs?: string;
          eh_folha?: boolean;
          smartsheet_row_id?: string | null;
          predecessores?: string | null;
          duracao_dias?: number | null;
          data_inicio_planejada?: string | null;
          data_fim_planejada?: string | null;
          data_inicio_linha_base?: string | null;
          data_fim_linha_base?: string | null;
          percentual_concluido?: number;
          caminho_critico?: boolean;
          folga_dias?: number | null;
          recurso?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'atividades_grupo_macro_id_fkey';
            columns: ['grupo_macro_id'];
            referencedRelation: 'grupos_macro';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'atividades_elemento_visual_id_fkey';
            columns: ['elemento_visual_id'];
            referencedRelation: 'elementos_visuais';
            referencedColumns: ['id'];
          },
        ];
      };

      avancos_semanais: {
        Row: {
          id: string;
          atividade_id: string;
          semana_referencia: string;
          percentual_planejado_acumulado: number;
          percentual_realizado_acumulado: number;
          observacoes: string | null;
          registrado_em: string;
          registrado_por: string | null;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          atividade_id: string;
          semana_referencia: string;
          percentual_planejado_acumulado?: number;
          percentual_realizado_acumulado?: number;
          observacoes?: string | null;
          registrado_em?: string;
          registrado_por?: string | null;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          atividade_id?: string;
          semana_referencia?: string;
          percentual_planejado_acumulado?: number;
          percentual_realizado_acumulado?: number;
          observacoes?: string | null;
          registrado_em?: string;
          registrado_por?: string | null;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'avancos_semanais_atividade_id_fkey';
            columns: ['atividade_id'];
            referencedRelation: 'atividades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'avancos_semanais_registrado_por_fkey';
            columns: ['registrado_por'];
            referencedRelation: 'perfis';
            referencedColumns: ['id'];
          },
        ];
      };

      diario_obra: {
        Row: {
          id: string;
          projeto_id: string;
          data: string;
          clima: string | null;
          efetivo: Json;
          equipamentos: Json;
          atividades_executadas: string | null;
          ocorrencias: string | null;
          autor_id: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          data: string;
          clima?: string | null;
          efetivo?: Json;
          equipamentos?: Json;
          atividades_executadas?: string | null;
          ocorrencias?: string | null;
          autor_id?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          data?: string;
          clima?: string | null;
          efetivo?: Json;
          equipamentos?: Json;
          atividades_executadas?: string | null;
          ocorrencias?: string | null;
          autor_id?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'diario_obra_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'diario_obra_autor_id_fkey';
            columns: ['autor_id'];
            referencedRelation: 'perfis';
            referencedColumns: ['id'];
          },
        ];
      };

      fotos_evidencia: {
        Row: {
          id: string;
          /** Dispositivo (projeto) a que a foto pertence — vínculo direto, evita resolver via diario/atividade/elemento. */
          projeto_id: string;
          diario_obra_id: string | null;
          atividade_id: string | null;
          elemento_visual_id: string | null;
          storage_path: string;
          legenda: string | null;
          criado_por: string | null;
          criado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          diario_obra_id?: string | null;
          atividade_id?: string | null;
          elemento_visual_id?: string | null;
          storage_path: string;
          legenda?: string | null;
          criado_por?: string | null;
          criado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          diario_obra_id?: string | null;
          atividade_id?: string | null;
          elemento_visual_id?: string | null;
          storage_path?: string;
          legenda?: string | null;
          criado_por?: string | null;
          criado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fotos_evidencia_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fotos_evidencia_diario_obra_id_fkey';
            columns: ['diario_obra_id'];
            referencedRelation: 'diario_obra';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fotos_evidencia_atividade_id_fkey';
            columns: ['atividade_id'];
            referencedRelation: 'atividades';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fotos_evidencia_elemento_visual_id_fkey';
            columns: ['elemento_visual_id'];
            referencedRelation: 'elementos_visuais';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fotos_evidencia_criado_por_fkey';
            columns: ['criado_por'];
            referencedRelation: 'perfis';
            referencedColumns: ['id'];
          },
        ];
      };

      concretagem_pedidos: {
        Row: {
          id: string;
          /** Dispositivo (projeto) a que o pedido de concreto pertence. */
          projeto_id: string;
          etapa: number;
          elementos: string[];
          elemento_visual_id: string | null;
          volume_m3: number;
          num_caminhoes: number | null;
          data_prevista: string | null;
          data_realizada: string | null;
          status: StatusPedidoConcretagem;
          checklist_json: Json;
          nota_fiscal_ref: string | null;
          combinado_com_sobra: boolean;
          observacoes: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          etapa: number;
          elementos?: string[];
          elemento_visual_id?: string | null;
          volume_m3: number;
          num_caminhoes?: number | null;
          data_prevista?: string | null;
          data_realizada?: string | null;
          status?: StatusPedidoConcretagem;
          checklist_json?: Json;
          nota_fiscal_ref?: string | null;
          combinado_com_sobra?: boolean;
          observacoes?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          etapa?: number;
          elementos?: string[];
          elemento_visual_id?: string | null;
          volume_m3?: number;
          num_caminhoes?: number | null;
          data_prevista?: string | null;
          data_realizada?: string | null;
          status?: StatusPedidoConcretagem;
          checklist_json?: Json;
          nota_fiscal_ref?: string | null;
          combinado_com_sobra?: boolean;
          observacoes?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concretagem_pedidos_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concretagem_pedidos_elemento_visual_id_fkey';
            columns: ['elemento_visual_id'];
            referencedRelation: 'elementos_visuais';
            referencedColumns: ['id'];
          },
        ];
      };

      orcamento_itens: {
        Row: {
          id: string;
          /** Dispositivo (projeto) a que o item de orçamento pertence. */
          projeto_id: string;
          item_codigo: string;
          descricao: string;
          unidade: string | null;
          quantidade: number;
          preco_unitario: number;
          valor_total: number;
          categoria: CategoriaOrcamento;
          valor_medido: number;
          /** Coluna gerada no banco — somente leitura. */
          percentual_medido: number;
          eh_compra_direta: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          projeto_id: string;
          item_codigo: string;
          descricao: string;
          unidade?: string | null;
          quantidade?: number;
          preco_unitario?: number;
          valor_total?: number;
          categoria: CategoriaOrcamento;
          valor_medido?: number;
          eh_compra_direta?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          id?: string;
          projeto_id?: string;
          item_codigo?: string;
          descricao?: string;
          unidade?: string | null;
          quantidade?: number;
          preco_unitario?: number;
          valor_total?: number;
          categoria?: CategoriaOrcamento;
          valor_medido?: number;
          eh_compra_direta?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orcamento_itens_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };
    };

    Views: {
      elementos_visuais_progresso: {
        Row: {
          id: string;
          nome: string;
          tipo: TipoElementoVisual;
          svg_path_id: string;
          ifc_global_id: string | null;
          ordem: number;
          total_atividades: number;
          atividades_concluidas: number;
          percentual_concluido: number;
          percentual_ponderado_duracao: number;
          faixa_progresso: FaixaProgresso;
          /** Ao final da lista: CREATE OR REPLACE VIEW só permite acrescentar colunas no fim. */
          projeto_id: string;
        };
        Relationships: [];
      };
      grupos_macro_progresso: {
        Row: {
          id: string;
          projeto_id: string;
          nome: string;
          ordem: number;
          total_atividades: number;
          atividades_criticas: number;
          percentual_concluido: number;
          percentual_ponderado_duracao: number;
          data_inicio_planejada: string | null;
          data_fim_planejada: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'grupos_macro_projeto_id_fkey';
            columns: ['projeto_id'];
            referencedRelation: 'projetos';
            referencedColumns: ['id'];
          },
        ];
      };
      orcamento_resumo_categoria: {
        Row: {
          categoria: CategoriaOrcamento;
          total_itens: number;
          valor_mao_de_obra: number;
          valor_medido_mao_de_obra: number;
          valor_compra_direta: number;
          valor_medido_compra_direta: number;
          /** Ao final da lista: CREATE OR REPLACE VIEW só permite acrescentar colunas no fim. */
          projeto_id: string;
        };
        Relationships: [];
      };
    };

    Functions: {
      perfil_atual: {
        Args: Record<string, never>;
        Returns: PerfilUsuarioEnum;
      };
      eh_gestor: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      eh_gestor_ou_fiscal: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      eh_usuario_do_app: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      percentual_elemento: {
        Args: { elemento_id: string };
        Returns: number;
      };
    };

    Enums: {
      perfil_usuario: PerfilUsuarioEnum;
      tipo_elemento_visual: TipoElementoVisual;
      status_pedido_concretagem: StatusPedidoConcretagem;
      categoria_orcamento: CategoriaOrcamento;
    };

    CompositeTypes: Record<string, never>;
  };
};

/* -----------------------------------------------------------------------------
 * Tipos de conveniência — usados pelos demais módulos do app.
 * Reanexar este bloco caso o arquivo seja regenerado pelo CLI do Supabase.
 * -------------------------------------------------------------------------- */

type Tabelas = Database['public']['Tables'];
type Visoes = Database['public']['Views'];

export type PerfilUsuario = Tabelas['perfis']['Row'];
export type Ugb = Tabelas['ugbs']['Row'];
export type Projeto = Tabelas['projetos']['Row'];
export type ProjetoPlanilhaSmartsheet = Tabelas['projeto_planilhas_smartsheet']['Row'];
export type GrupoMacro = Tabelas['grupos_macro']['Row'];
export type ElementoVisual = Tabelas['elementos_visuais']['Row'];
export type PerfilUsuarioUpdate = Tabelas['perfis']['Update'];
export type Atividade = Tabelas['atividades']['Row'];
export type HistoricoCronograma = Tabelas['historico_cronograma']['Row'];
export type HistoricoCronogramaInsert = Tabelas['historico_cronograma']['Insert'];
export type AvancoSemanal = Tabelas['avancos_semanais']['Row'];
export type DiarioObra = Tabelas['diario_obra']['Row'];
export type FotoEvidencia = Tabelas['fotos_evidencia']['Row'];
export type ConcretagemPedido = Tabelas['concretagem_pedidos']['Row'];
export type OrcamentoItem = Tabelas['orcamento_itens']['Row'];

export type ElementoVisualProgresso = Visoes['elementos_visuais_progresso']['Row'];
export type GrupoMacroProgresso = Visoes['grupos_macro_progresso']['Row'];
export type OrcamentoResumoCategoria = Visoes['orcamento_resumo_categoria']['Row'];

/** Payloads de escrita (insert/update) mais usados. */
export type AtividadeInsert = Tabelas['atividades']['Insert'];
export type AtividadeUpdate = Tabelas['atividades']['Update'];
export type GrupoMacroInsert = Tabelas['grupos_macro']['Insert'];
export type AvancoSemanalInsert = Tabelas['avancos_semanais']['Insert'];
export type DiarioObraInsert = Tabelas['diario_obra']['Insert'];
export type FotoEvidenciaInsert = Tabelas['fotos_evidencia']['Insert'];
export type ConcretagemPedidoInsert = Tabelas['concretagem_pedidos']['Insert'];
export type OrcamentoItemInsert = Tabelas['orcamento_itens']['Insert'];
export type UgbInsert = Tabelas['ugbs']['Insert'];
export type ProjetoInsert = Tabelas['projetos']['Insert'];
export type ProjetoPlanilhaSmartsheetInsert = Tabelas['projeto_planilhas_smartsheet']['Insert'];

/** Volume mínimo de concreto por pedido, em m³ (espelha a constraint do banco). */
export const VOLUME_MINIMO_CONCRETO_M3 = 5;
