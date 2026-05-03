'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSuggestedNicknameAction } from '@/app/actions';

interface NicknameSuggesterProps {
  onNicknameSelect: (nickname: string) => void;
}

export function NicknameSuggester({ onNicknameSelect }: NicknameSuggesterProps) {
  const [preferences, setPreferences] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSuggest = async () => {
    if (!preferences.trim()) return;
    setIsLoading(true);
    setSuggestion('');
    try {
      const result = await getSuggestedNicknameAction({ foodPreferences: preferences });
      setSuggestion(result);
    } catch (error) {
      console.error(error);
      setSuggestion('Error :(');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseSuggestion = () => {
    if (suggestion && suggestion !== 'Error :(') {
      onNicknameSelect(suggestion);
      setSuggestion('');
      setPreferences('');
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">¿Sin ideas? ¡Obtén una sugerencia!</label>
      <div className="flex gap-2">
        <Input
          placeholder="Ej: amo las papas fritas"
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          disabled={isLoading}
        />
        <Button onClick={handleSuggest} disabled={isLoading || !preferences.trim()}>
          <Wand2 className="h-4 w-4" />
          <span className="sr-only">Sugerir</span>
        </Button>
      </div>
      {(isLoading || suggestion) && (
        <div className="p-2 bg-muted rounded-md text-sm text-center">
            {isLoading && <p>Pensando en algo genial...</p>}
            {suggestion && !isLoading && (
              <div className="flex items-center justify-between">
                <p>Sugerencia: <span className="font-bold">{suggestion}</span></p>
                <Button size="sm" variant="ghost" onClick={handleUseSuggestion}>Usar</Button>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
