/**
 * Nickname suggestion with Google's Gemini API, called directly over REST.
 * (It used to go through Genkit, which pulled in ~80 transitive packages and most
 * of the npm audit warnings for this one small feature.)
 *
 * Server-only: the API key never reaches the browser.
 */

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

/** Keeps what the cart accepts: one line, no markup, max 30 characters. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>{}[\]`*_#"]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 30)
    .trim();
  return text.length > 0 ? text : null;
}

export async function suggestNickname(foodPreferences: string, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENAI_API_KEY no está configurada');

  const res = await fetch(ENDPOINT(MODEL()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text:
            'Eres el ayudante de un food truck chileno. Inventas UN apodo corto, divertido y amable ' +
            '(máximo 3 palabras, menos de 30 caracteres) a partir de lo que le gusta comer a la persona. ' +
            'En español. Nada ofensivo, sexual ni que se burle del físico. Responde solo con el JSON pedido.',
        }],
      },
      contents: [{ role: 'user', parts: [{ text: `Lo que me gusta comer: ${foodPreferences}` }] }],
      generationConfig: {
        temperature: 1,
        maxOutputTokens: 60,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { nickname: { type: 'STRING' } },
          required: ['nickname'],
        },
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini respondió ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text)?.nickname : null; } catch { parsed = text; }
  const nickname = cleanNickname(parsed);
  if (!nickname) throw new Error('Gemini no devolvió un apodo');
  return nickname;
}
