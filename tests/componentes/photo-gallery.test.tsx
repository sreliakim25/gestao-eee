/**
 * Fotos de evidência do RDO (`PhotoGallery`).
 *
 * `fotos_evidencia.projeto_id` é NOT NULL no banco (dispositivo dono da foto,
 * necessário para a expansão multi-dispositivo). Sem este teste, um insert que
 * esquecesse `projeto_id` só quebraria em produção contra o Postgres real — o
 * `npm run build` não pega isso porque o tipo estreito só é checado quando o
 * componente é exercitado, não quando é lido.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PhotoGallery } from '@/components/diario/PhotoGallery';
import type { FotoEvidencia } from '@/types/database';

const insertMock = vi.fn(async () => ({ error: null }));
const uploadMock = vi.fn(async () => ({ error: null }));
const removeMock = vi.fn(async () => ({ error: null }));
const createSignedUrlsMock = vi.fn(async () => ({ data: [] }));
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/diario',
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: insertMock }),
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        createSignedUrls: createSignedUrlsMock,
      }),
    },
  }),
}));

const PROJETO_ID = '00000000-0000-4000-8000-000000000099';
const DIARIO_OBRA_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';

function renderizar(diarioObraId: string | null = DIARIO_OBRA_ID) {
  return render(
    <PhotoGallery
      projetoId={PROJETO_ID}
      data="2026-08-17"
      diarioObraId={diarioObraId}
      fotos={[] as readonly FotoEvidencia[]}
      usuarioId={USUARIO_ID}
      podeEnviar={true}
    />,
  );
}

function arquivoValido() {
  return new File(['conteudo-fake'], 'concretagem.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
  insertMock.mockClear();
  uploadMock.mockClear();
  removeMock.mockClear();
  createSignedUrlsMock.mockClear();
  refreshMock.mockClear();
});

describe('<PhotoGallery />', () => {
  it('envia o arquivo pro Storage e grava a foto com o projeto_id do dispositivo', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const input = screen.getByLabelText(/enviar foto/i);
    await usuario.upload(input, arquivoValido());

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);

    const [payload] = insertMock.mock.calls[0] as unknown as [Record<string, unknown>];
    // Regressão que motivou este teste: sem `projeto_id`, o insert violava a
    // constraint NOT NULL da tabela `fotos_evidencia`.
    expect(payload).toMatchObject({
      projeto_id: PROJETO_ID,
      diario_obra_id: DIARIO_OBRA_ID,
      criado_por: USUARIO_ID,
    });
    expect(typeof payload.storage_path).toBe('string');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('não deixa anexar foto antes do RDO do dia estar salvo', () => {
    renderizar(null);

    expect(
      screen.getByText(/salve o relatório do dia primeiro/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/enviar foto/i)).toBeDisabled();
  });

  it('recusa formato de imagem fora da lista aceita antes de subir ao Storage', async () => {
    const usuario = userEvent.setup();
    renderizar();

    // `image/gif` passa no filtro `accept="image/*"` do <input> (então o
    // user-event de fato dispara o change), mas não está na lista de formatos
    // aceitos pela regra de negócio (`TIPOS_IMAGEM_ACEITOS`).
    const arquivoInvalido = new File(['x'], 'planta.gif', { type: 'image/gif' });
    await usuario.upload(screen.getByLabelText(/enviar foto/i), arquivoInvalido);

    expect(await screen.findByText(/formato não aceito/i)).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('desfaz o upload no Storage se o insert no banco falhar (evita órfão)', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'falhou' } as never });
    const usuario = userEvent.setup();
    renderizar();

    await usuario.upload(screen.getByLabelText(/enviar foto/i), arquivoValido());

    expect(await screen.findByText(/não pôde ser vinculada ao rdo/i)).toBeInTheDocument();
    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
