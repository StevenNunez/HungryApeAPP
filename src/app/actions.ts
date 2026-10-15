'use server';

import { headers } from 'next/headers';
import { suggestUserNickname, type SuggestUserNicknameInput } from '@/ai/flows/suggest-user-nickname';
import { rateLimit } from '@/lib/rate-limit';

export async function getSuggestedNicknameAction(input: SuggestUserNicknameInput): Promise<string> {
  // Public action backed by a paid AI quota: cap per IP and bound the input size.
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  if (!rateLimit(`nickname:${ip}`, 8, 10 * 60 * 1000)) {
    return 'Error :(';
  }

  const foodPreferences = String(input?.foodPreferences ?? '').slice(0, 100);

  try {
    const result = await suggestUserNickname({ foodPreferences });
    return result.nickname;
  } catch (error) {
    console.error('Error suggesting nickname:', error);
    return 'Error al sugerir';
  }
}
