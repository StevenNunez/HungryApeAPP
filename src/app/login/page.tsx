'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react';

// ─── Google icon ──────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

type Mode = 'login' | 'signup' | 'forgot';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState(searchParams.get('business') || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Surface auth callback errors
  useEffect(() => {
    const error = searchParams.get('error');
    if (error === 'auth_callback_failed') {
      toast({ title: 'Error de autenticación', description: 'El enlace expiró o es inválido. Inténtalo de nuevo.', variant: 'destructive' });
    }
  }, [searchParams, toast]);

  // Redirect if already logged in
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  // ── Google OAuth ────────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Page navigates away; no setGoogleLoading(false) needed
  };

  // ── Forgot password ─────────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setForgotSent(true);
  };

  // ── Email + password ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === 'signup') {
        const callbackUrl = `${window.location.origin}/auth/callback?next=/dashboard`;

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { business_name: businessName },
            emailRedirectTo: callbackUrl,
          },
        });

        if (authError) throw authError;

        // Try signing in immediately (works if email confirmation is disabled)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) {
          // Email confirmation required → tell the user
          toast({
            title: '📧 Revisa tu correo',
            description: 'Te enviamos un enlace de confirmación. Haz click en él para activar tu cuenta.',
          });
          setMode('login');
          setLoading(false);
          return;
        }

        // Session active — create the tenant
        if (authData.user) {
          const slug = businessName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 30);
          const uniqueSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

          const { error: tenantError } = await supabase.from('tenants').insert({
            slug: uniqueSlug,
            name: businessName,
            owner_id: authData.user.id,
            subscription_status: 'trial',
            trial_ends_at: trialEndsAt,
          } as any);

          if (tenantError) {
            console.error('Tenant creation error:', tenantError);
          }
        }

        // Fire welcome email (non-blocking)
        fetch('/api/email/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: email, businessName, planId: 'gratis' }),
        }).catch(() => {});

        toast({ title: '🦍 ¡Bienvenido a Hungry Ape!', description: 'Tu food truck digital está listo.' });
        router.push('/dashboard');

      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            throw new Error('Tu correo no ha sido confirmado. Revisa tu bandeja de entrada.');
          }
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error('Correo o contraseña incorrectos.');
          }
          throw error;
        }
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Algo salió mal.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password success screen ─────────────────────────────────────────
  if (forgotSent) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border shadow-2xl text-center">
          <CardContent className="pt-10 pb-8 px-8">
            <div className="inline-flex p-4 bg-green-500/10 rounded-full mb-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="font-brand text-2xl tracking-wide mb-2">REVISA TU CORREO</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Enviamos el enlace de recuperación a <strong>{email}</strong>. Tienes 10 minutos para usarlo.
            </p>
            <Button variant="outline" className="w-full rounded-xl" onClick={() => { setForgotSent(false); setMode('login'); }}>
              Volver al login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inicio
      </Link>

      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="relative inline-flex items-baseline mb-2">
          <span aria-hidden="true" className="absolute inset-0 -inset-x-4 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0" style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }} />
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>HUNGRY</span>
          <span className="relative z-10 text-2xl mx-1" style={{ lineHeight: 1 }}>🍌</span>
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>APE</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3">Fast Food App</p>
      </div>

      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader className="text-center pb-4">
          <h1 className="font-brand text-2xl tracking-wide">
            {mode === 'login' ? 'INICIAR SESIÓN' : mode === 'signup' ? 'CREAR CUENTA' : 'RECUPERAR CONTRASEÑA'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'login' && 'Ingresa a tu dashboard para administrar tu negocio.'}
            {mode === 'signup' && 'Registra tu food truck y empieza a recibir pedidos hoy.'}
            {mode === 'forgot' && 'Te enviaremos un enlace para restablecer tu contraseña.'}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Email + password form */}
          <form onSubmit={mode === 'forgot' ? handleForgot : handleSubmit} className="space-y-4">
            {/* Business name — signup only */}
            {mode === 'signup' && (
              <div>
                <label htmlFor="businessName" className="text-sm font-medium mb-1.5 block">
                  Nombre de tu Food Truck
                </label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="Ej: Tacos el Tío"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="text-sm font-medium mb-1.5 block">
                Correo electrónico
              </label>
              <Input
                id="email"
                type="email"
                placeholder="tu@foodtruck.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>

            {/* Password — not in forgot mode */}
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Contraseña
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-primary hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
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
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-5 text-base active:scale-95 transition-all"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'login' && 'Entrar'}
              {mode === 'signup' && 'Crear mi Food Truck'}
              {mode === 'forgot' && (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Enviar enlace de recuperación
                </>
              )}
            </Button>
          </form>

          {/* Google OAuth — login and signup modes only */}
          {mode !== 'forgot' && (
            <>
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground tracking-widest">O continúa con</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl py-5 flex items-center gap-3 font-semibold"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
              >
                {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                {mode === 'signup' ? 'Registrarse con Google' : 'Continuar con Google'}
              </Button>
            </>
          )}

          {/* Footer links */}
          <div className="text-center text-sm pt-2">
            {mode === 'login' && (
              <p className="text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <button onClick={() => setMode('signup')} className="text-primary font-semibold hover:underline">
                  Regístrate
                </button>
              </p>
            )}
            {mode === 'signup' && (
              <p className="text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <button onClick={() => setMode('login')} className="text-primary font-semibold hover:underline">
                  Inicia sesión
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => setMode('login')} className="text-muted-foreground hover:text-foreground hover:underline">
                ← Volver al login
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-8 text-xs text-muted-foreground">© 2026 Hungry Ape — Todos los derechos reservados.</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
