'use client';

import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSuggestedNicknameAction } from '@/app/actions';

interface NicknameSuggesterProps {
  onNicknameSelect: (nickname: string) => void;
}

export function NicknameSuggester({ onNicknameSelect }: NicknameSuggesterProps) {
  const [preferences, setPreferences] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [failure, setFailure] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSuggest = async () => {
    if (!preferences.trim()) return;
    setIsLoading(true);
    setSuggestion('');
    setFailure('');
    try {
      const result = await getSuggestedNicknameAction({ foodPreferences: preferences });
      if ('nickname' in result) setSuggestion(result.nickname);
      else setFailure(result.error);
    } catch {
      setFailure('No pudimos pensar un apodo ahora. Escribe el tuyo 🙂');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseSuggestion = () => {
    if (!suggestion) return;
    onNicknameSelect(suggestion);
    setSuggestion('');
    setPreferences('');
  };

  return (
    <div className="space-y-2">
      <label htmlFor="nickname-preferences" className="text-sm font-medium text-muted-foreground">
        ¿Sin ideas? ¡Obtén una sugerencia!
      </label>
      <div className="flex gap-2">
        <Input
          id="nickname-preferences"
          placeholder="Ej: amo las papas fritas"
          value={preferences}
          maxLength={100}
          onChange={(e) => setPreferences(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSuggest(); } }}
          disabled={isLoading}
        />
        <Button onClick={handleSuggest} disabled={isLoading || !preferences.trim()} className="h-10 w-11 shrink-0">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          <span className="sr-only">Sugerir apodo</span>
        </Button>
      </div>
      {(isLoading || suggestion || failure) && (
        <div className="p-2 bg-muted rounded-md text-sm text-center" aria-live="polite">
          {isLoading && <p>Pensando en algo genial...</p>}
          {failure && !isLoading && <p className="text-muted-foreground">{failure}</p>}
          {suggestion && !isLoading && (
            <div className="flex items-center justify-between gap-2">
              <p>Sugerencia: <span className="font-bold">{suggestion}</span></p>
              <Button size="sm" variant="ghost" onClick={handleUseSuggestion} className="min-h-11">Usar</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
