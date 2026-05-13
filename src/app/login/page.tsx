'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState(searchParams.get('business') || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/dashboard');
      }
    }
    checkAuth();
  }, [router]);

  // Set values if they change in URL
  useEffect(() => {
    if (searchParams.get('email')) setEmail(searchParams.get('email') || '');
    if (searchParams.get('business')) setBusinessName(searchParams.get('business') || '');
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === 'signup') {
        // 1) Create the auth user (email confirmation disabled in Supabase settings)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { business_name: businessName },
            // Skip email confirmation for frictionless onboarding
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (authError) throw authError;

        // 2) Immediately sign in so the session is active (needed for RLS)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          // If email confirmation is required, show a friendly message
          if (signInError.message.toLowerCase().includes('email not confirmed')) {
            toast({
              title: '📧 Confirma tu correo',
              description: 'Te enviamos un enlace de confirmación. Revisa tu bandeja (y spam).',
            });
            setMode('login');
            setLoading(false);
            return;
          }
          throw signInError;
        }

        // 3) Now the session is active — create the tenant record
        if (authData.user) {
          const slug = businessName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 30);

          // Add a random suffix to avoid slug collisions
          const uniqueSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          const { error: tenantError } = await supabase
            .from('tenants')
            .insert({
              slug: uniqueSlug,
              name: businessName,
              owner_id: authData.user.id,
              subscription_status: 'trial',
              trial_ends_at: trialEndsAt,
            });

          if (tenantError) {
            console.error('Tenant creation error:', tenantError);
            // Don't throw — user is created, tenant creation can be retried from the dashboard
            toast({
              title: '⚠️ Aviso',
              description: 'Tu cuenta fue creada pero hubo un error configurando tu negocio. Lo resolveremos en el dashboard.',
            });
          }
        }

        toast({
          title: '🦍 ¡Bienvenido a Hungry Ape!',
          description: 'Tu food truck digital está listo. Redirigiendo...',
        });

        // Fire welcome email (non-blocking — don't await)
        fetch('/api/email/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            businessName,
            planId: 'gratis',
          }),
        }).catch(err => console.warn('Welcome email failed:', err));

        router.push('/dashboard');
      } else {
        // Login
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          // Friendly Spanish error messages
          if (error.message.toLowerCase().includes('email not confirmed')) {
            throw new Error('Tu correo no ha sido confirmado. Revisa tu bandeja de entrada (y spam).');
          }
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error('Correo o contraseña incorrectos.');
          }
          throw error;
        }

        toast({
          title: '¡Bienvenido de vuelta! 🍌',
          description: 'Redirigiendo a tu dashboard...',
        });

        router.push('/dashboard');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Algo salió mal. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      {/* Back to home */}
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
          <span
            aria-hidden="true"
            className="absolute inset-0 -inset-x-4 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -z-0"
            style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }}
          />
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>HUNGRY</span>
          <span className="relative z-10 text-2xl mx-1" style={{ lineHeight: 1 }}>🍌</span>
          <span className="relative z-10 font-brand text-3xl tracking-wider text-foreground" style={{ lineHeight: 1 }}>APE</span>
        </div>
        <p className="text-sm text-muted-foreground mt-3">Fast Food App</p>
      </div>

      {/* Card */}
      <Card className="w-full max-w-md border-border shadow-2xl">
        <CardHeader className="text-center pb-4">
          <h1 className="font-brand text-2xl tracking-wide">
            {mode === 'login' ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === 'login'
              ? 'Ingresa a tu dashboard para administrar tu negocio.'
              : 'Registra tu food truck y empieza a recibir pedidos hoy.'}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business name (signup only) */}
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

            {/* Password */}
            <div>
              <label htmlFor="password" className="text-sm font-medium mb-1.5 block">
                Contraseña
              </label>
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

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-5 text-base active:scale-95 transition-all"
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'login' ? 'Entrar' : 'Crear mi Food Truck'}
            </Button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 text-center text-sm">
            {mode === 'login' ? (
              <p className="text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <button
                  onClick={() => setMode('signup')}
                  className="text-primary font-semibold hover:underline"
                >
                  Regístrate gratis
                </button>
              </p>
            ) : (
              <p className="text-muted-foreground">
                ¿Ya tienes cuenta?{' '}
                <button
                  onClick={() => setMode('login')}
                  className="text-primary font-semibold hover:underline"
                >
                  Inicia sesión
                </button>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">
        © 2026 Hungry Ape — Todos los derechos reservados.
      </p>
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
