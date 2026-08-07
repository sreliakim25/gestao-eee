import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Crimson_Pro } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { getPerfilAtual, getUsuarioAtual } from '@/lib/supabase/server';
import type { PerfilUsuario } from '@/types/database';

// Tipografia oficial do projeto: Playfair Display nos títulos, Crimson Pro no corpo.
const playfairDisplay = Playfair_Display({
  variable: '--font-playfair-display',
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700'],
});

const crimsonPro = Crimson_Pro({
  variable: '--font-crimson-pro',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'EEE Novo Mundo — Gestão de Obra',
  description:
    'Acompanhamento da execução da Estação Elevatória de Esgoto do Novo Mundo (Viana & Moura Construções).',
};

export const viewport: Viewport = {
  themeColor: '#8B1A1A',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // A sessão é lida no layout raiz para que todos os módulos (inclusive os de
  // outros agentes) recebam a mesma casca já com o perfil resolvido.
  // Sem Supabase configurado (build local, CI) o app ainda renderiza deslogado.
  let perfil: PerfilUsuario | null = null;
  let emailUsuario: string | null = null;
  try {
    const usuario = await getUsuarioAtual();
    if (usuario) {
      emailUsuario = usuario.email ?? null;
      perfil = await getPerfilAtual();
    }
  } catch {
    perfil = null;
  }

  return (
    <html
      lang="pt-BR"
      className={`${playfairDisplay.variable} ${crimsonPro.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell perfil={perfil} emailUsuario={emailUsuario}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
