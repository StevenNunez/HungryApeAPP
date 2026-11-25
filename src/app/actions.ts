'use server';

import { headers } from 'next/headers';
import { suggestNickname } from '@/lib/nickname';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { anotarError } from '@/lib/errores-servidor';

export async function getSuggestedNicknameAction(input: { foodPreferences: string }): Promise<{ nickname: string } | { error: string }> {
  // Public action backed by a paid AI quota: cap per IP and bound the input size.
  const h = await headers();
  if (!rateLimit(`nickname:${clientIp(h)}`, 8, 10 * 60 * 1000)) {
    return { error: 'Pediste varias sugerencias seguidas. Espera unos minutos o escribe tu apodo.' };
  }

  const foodPreferences = String(input?.foodPreferences ?? '').slice(0, 100).trim();
  if (!foodPreferences) return { error: 'Cuéntanos qué te gusta comer.' };

  try {
    return { nickname: await suggestNickname(foodPreferences, AbortSignal.timeout(8000)) };
  } catch (error) {
    await anotarError({ origen: 'servidor', donde: 'action sugerir apodo', error });
    return { error: 'No pudimos pensar un apodo ahora. Escribe el tuyo 🙂' };
  }
}
