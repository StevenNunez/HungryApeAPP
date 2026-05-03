// A Genkit Flow to suggest a user nickname based on their food preferences.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

/**
 * @fileOverview This file defines a Genkit flow for suggesting a user nickname based on their food preferences.
 *
 * The flow takes user's food preferences as input and returns a suggested nickname.
 *
 * @param {SuggestUserNicknameInput} input - The input to the flow.
 * @returns {Promise<SuggestUserNicknameOutput>} - The suggested nickname.
 */

const SuggestUserNicknameInputSchema = z.object({
  foodPreferences: z
    .string()
    .describe('The user food preferences to generate nicknames.'),
});

export type SuggestUserNicknameInput = z.infer<typeof SuggestUserNicknameInputSchema>;

const SuggestUserNicknameOutputSchema = z.object({
  nickname: z.string().describe('The suggested nickname for the user.'),
});

export type SuggestUserNicknameOutput = z.infer<typeof SuggestUserNicknameOutputSchema>;

export async function suggestUserNickname(
  input: SuggestUserNicknameInput
): Promise<SuggestUserNicknameOutput> {
  return suggestUserNicknameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestUserNicknamePrompt',
  input: {schema: SuggestUserNicknameInputSchema},
  output: {schema: SuggestUserNicknameOutputSchema},
  prompt: `Suggest a fun and original nickname based on the user's food preferences:

User Food Preferences: {{{foodPreferences}}}

Ensure the nickname is appropriate and does not contain any offensive language.`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_ONLY_HIGH',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_LOW_AND_ABOVE',
      },
    ],
  },
});

const suggestUserNicknameFlow = ai.defineFlow(
  {
    name: 'suggestUserNicknameFlow',
    inputSchema: SuggestUserNicknameInputSchema,
    outputSchema: SuggestUserNicknameOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
