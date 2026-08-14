import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a toda resposta. Não restringem `camera`
// (o Diário de Obra usa `capture="environment"` para evidência fotográfica),
// só o que o app comprovadamente não usa.
const CABECALHOS_SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: CABECALHOS_SEGURANCA,
      },
    ];
  },
};

export default nextConfig;
