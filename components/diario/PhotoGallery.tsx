'use client';

/**
 * Fotos de evidência do RDO.
 *
 * O bucket `fotos-obra` é PRIVADO: nada de URL pública. Cada miniatura usa uma
 * signed URL de curta duração, gerada no cliente com a sessão do usuário (a
 * política de Storage exige `eh_usuario_do_app()`).
 */

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { FotoEvidencia } from '@/types/database';
import { Alert, Card } from '@/components/ui/primitives';
import { caminhoDaFoto, validarArquivoDeFoto } from './dailyLog';

const BUCKET_FOTOS = 'fotos-obra';
const VALIDADE_URL_SEGUNDOS = 60 * 10;

interface PhotoGalleryProps {
  projetoId: string;
  data: string;
  /** `null` quando o RDO do dia ainda não foi salvo. */
  diarioObraId: string | null;
  fotos: readonly FotoEvidencia[];
  usuarioId: string;
  podeEnviar: boolean;
}

export function PhotoGallery({
  projetoId,
  data,
  diarioObraId,
  fotos,
  usuarioId,
  podeEnviar,
}: PhotoGalleryProps) {
  const router = useRouter();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [legenda, setLegenda] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Gera as signed URLs das fotos já cadastradas.
  useEffect(() => {
    let ativo = true;
    // Sem fotos não há URL a assinar. Não limpamos o estado aqui de propósito:
    // as chaves do mapa são `storage_path`, então entradas remanescentes nunca
    // são consultadas — e um setState síncrono no efeito dispara render em
    // cascata sem necessidade.
    if (fotos.length === 0) return;

    (async () => {
      try {
        const { data: assinadas } = await createClient()
          .storage.from(BUCKET_FOTOS)
          .createSignedUrls(
            fotos.map((foto) => foto.storage_path),
            VALIDADE_URL_SEGUNDOS,
          );
        if (!ativo || !assinadas) return;

        const mapa: Record<string, string> = {};
        for (const item of assinadas) {
          if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl;
        }
        setUrls(mapa);
      } catch {
        // Miniatura indisponível não deve derrubar a tela do RDO.
      }
    })();

    return () => {
      ativo = false;
    };
  }, [fotos]);

  const enviarFoto = useCallback(
    async (evento: ChangeEvent<HTMLInputElement>) => {
      const arquivo = evento.target.files?.[0];
      evento.target.value = ''; // permite reenviar o mesmo arquivo
      if (!arquivo) return;

      setErro(null);

      if (!diarioObraId) {
        setErro('Salve o RDO do dia antes de anexar fotos.');
        return;
      }

      const problema = validarArquivoDeFoto(arquivo);
      if (problema) {
        setErro(problema);
        return;
      }

      setEnviando(true);
      try {
        const supabase = createClient();
        const caminho = caminhoDaFoto(
          projetoId,
          data,
          arquivo.name,
          crypto.randomUUID(),
        );

        const { error: erroUpload } = await supabase.storage
          .from(BUCKET_FOTOS)
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });

        if (erroUpload) {
          setErro('Não foi possível enviar a foto. Tente novamente.');
          return;
        }

        const { error: erroBanco } = await supabase.from('fotos_evidencia').insert({
          diario_obra_id: diarioObraId,
          storage_path: caminho,
          legenda: legenda.trim() || null,
          criado_por: usuarioId,
        });

        if (erroBanco) {
          // Órfão no Storage é pior que erro visível: tenta desfazer o upload.
          await supabase.storage.from(BUCKET_FOTOS).remove([caminho]);
          setErro('A foto foi enviada mas não pôde ser vinculada ao RDO.');
          return;
        }

        setLegenda('');
        router.refresh();
      } catch {
        setErro('Falha de conexão durante o envio da foto.');
      } finally {
        setEnviando(false);
      }
    },
    [data, diarioObraId, legenda, projetoId, router, usuarioId],
  );

  return (
    <Card>
      <h2 className="mb-3 font-titulo text-xl text-vinho">Fotos do dia</h2>

      {erro ? (
        <div className="mb-3">
          <Alert tone="erro">{erro}</Alert>
        </div>
      ) : null}

      {podeEnviar ? (
        <div className="mb-4 space-y-2">
          <label htmlFor="legenda-foto" className="block text-sm font-semibold text-tinta">
            Legenda (opcional)
          </label>
          <input
            id="legenda-foto"
            value={legenda}
            onChange={(evento) => setLegenda(evento.target.value)}
            maxLength={200}
            placeholder="ex.: concretagem da laje de fundo"
            className="w-full rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta"
          />

          <label
            htmlFor="arquivo-foto"
            className="block text-sm font-semibold text-tinta"
          >
            Enviar foto (JPG, PNG, WEBP ou HEIC, até 10 MB)
          </label>
          <input
            id="arquivo-foto"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={enviando || !diarioObraId}
            onChange={enviarFoto}
            className="w-full rounded-md border border-borda bg-creme-claro px-3 py-2 text-tinta"
          />
          {!diarioObraId ? (
            <p className="text-sm text-tinta-suave">
              As fotos ficam vinculadas ao RDO — salve o relatório do dia primeiro.
            </p>
          ) : null}
          {enviando ? <p className="text-sm text-tinta-suave">Enviando foto…</p> : null}
        </div>
      ) : null}

      {fotos.length === 0 ? (
        <p className="text-tinta-suave">Nenhuma foto anexada a este dia.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((foto) => (
            <li key={foto.id} className="overflow-hidden rounded-md border border-borda">
              {urls[foto.storage_path] ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL temporária de bucket privado; otimizador do Next não se aplica
                <img
                  src={urls[foto.storage_path]}
                  alt={foto.legenda ?? 'Foto de evidência da obra'}
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-creme text-sm text-tinta-suave">
                  carregando…
                </div>
              )}
              {foto.legenda ? (
                <p className="px-2 py-1 text-sm text-tinta-suave">{foto.legenda}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
