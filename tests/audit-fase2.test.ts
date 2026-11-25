import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({ createServiceSupabaseClient: vi.fn() }));
vi.mock('@/lib/email', () => ({
  escapeHtml: (s: string) => s,
  sendInternalEmail: vi.fn(),
  smtpConfigured: () => false,
  teoLabsSignature: () => '',
}));

import { cleanNickname, suggestNickname } from '@/lib/nickname';
import { explicarError } from '@/lib/errores';
import { huellaDe, normalizarMensaje } from '@/lib/errores-servidor';

describe('apodo sugerido', () => {
  it('limpia lo que devuelve el modelo: una línea, sin marcas, máx. 30 caracteres', () => {
    expect(cleanNickname('  **El Rey\nde las Papas**  ')).toBe('El Rey de las Papas');
    expect(cleanNickname('Un apodo larguísimo que no cabe en el carrito')).toHaveLength(30);
    expect(cleanNickname('')).toBeNull();
    expect(cleanNickname(42)).toBeNull();
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('llama a Gemini con la clave en el encabezado (no en la URL) y lee el JSON', async () => {
    vi.stubEnv('GOOGLE_GENAI_API_KEY', 'clave-de-prueba');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"nickname":"Gorila Papero"}' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestNickname('papas fritas')).resolves.toBe('Gorila Papero');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('clave-de-prueba');
    expect(init.headers['x-goog-api-key']).toBe('clave-de-prueba');
  });

  it('falla claro si Gemini responde con error', async () => {
    vi.stubEnv('GOOGLE_GENAI_API_KEY', 'x');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'quota' }));
    await expect(suggestNickname('tacos')).rejects.toThrow(/429/);
  });
});

describe('errores para personas', () => {
  it('traduce errores de Supabase Auth', () => {
    expect(explicarError(new Error('Invalid login credentials')).mensaje).toBe('Correo o contraseña incorrectos.');
  });

  it('no muestra inglés técnico crudo y lo marca para reportar', () => {
    const r = explicarError(new Error('Unexpected token in JSON at position 3'));
    expect(r.mensaje).not.toMatch(/Unexpected/);
    expect(r.reportar).toBe(true);
  });

  it('deja pasar nuestros mensajes en castellano', () => {
    const r = explicarError(new Error('Solo se puede anular un pedido que aún no se empieza a preparar'));
    expect(r.mensaje).toMatch(/anular/);
    expect(r.reportar).toBe(false);
  });
});

describe('huella del registro de errores', () => {
  it('agrupa el mismo error aunque cambien ids y números', () => {
    const a = 'Order 3f2b1c9e-1111-2222-3333-444455556666 failed after 1200 ms';
    const b = 'Order 9a8b7c6d-aaaa-bbbb-cccc-ddddeeeeffff failed after 87 ms';
    expect(normalizarMensaje(a)).toBe(normalizarMensaje(b));
    expect(huellaDe('servidor', 'api/x', a)).toBe(huellaDe('servidor', 'api/x', b));
    expect(huellaDe('servidor', 'api/y', a)).not.toBe(huellaDe('servidor', 'api/x', a));
  });
});
