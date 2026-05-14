'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Wait for the session established by /auth/callback
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // No session — link expired or already used
        toast({
          title: 'Enlace inválido',
          description: 'El enlace de recuperación expiró o ya fue usado. Solicita uno nuevo.',
          variant: 'destructive',
        });
        router.replace('/login');
        return;
      }
      setSessionReady(true);
    });
  }, [router, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'Las contraseñas no coinciden', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'La contraseña debe tener al menos 6 caracteres', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: 'Error al actualizar contraseña', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    toast({ title: '✅ Contraseña actualizada', description: 'Redirigiendo a tu dashboard...' });
    router.replace('/dashboard');
  };

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="mb-8 text-center">
        <div className="relative inline-flex items-baseline mb-2">
          <span
            aria-hidden="true"
            className="absolute inset-0 -inset-x-4 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0"
            style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }}
          />
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>HUNGRY</span>
          <span className="relative z-10 text-2xl mx-1" style={{ lineHeight: 1 }}>🍌</span>
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>APE</span>
        </div>
      </div>

      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader className="text-center pb-4">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl mx-auto mb-3">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-brand text-2xl tracking-wide">NUEVA CONTRASEÑA</h1>
          <p className="text-sm text-muted-foreground mt-1">Elige una contraseña segura para tu cuenta.</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="text-sm font-medium mb-1.5 block">
                Nueva contraseña
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-xl pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm" className="text-sm font-medium mb-1.5 block">
                Confirmar contraseña
              </label>
              <Input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                placeholder="Repite tu contraseña"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-5 text-base"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar nueva contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
