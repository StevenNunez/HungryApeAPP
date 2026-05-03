'use server';

import { suggestUserNickname, type SuggestUserNicknameInput } from '@/ai/flows/suggest-user-nickname';

export async function getSuggestedNicknameAction(input: SuggestUserNicknameInput): Promise<string> {
  try {
    const result = await suggestUserNickname(input);
    return result.nickname;
  } catch (error) {
    console.error('Error suggesting nickname:', error);
    return 'Error al sugerir';
  }
}
