'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Store, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState('');

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push('/login');
      return;
    }

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);

    const { error } = await supabase.from('tenants').insert({
      slug,
      name: businessName,
      owner_id: user.id,
      subscription_status: 'trial',
    });

    if (error) {
      toast({
        title: 'Error al crear negocio',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    toast({
      title: '🦍 ¡Negocio creado!',
      description: 'Tu food truck está listo.',
    });
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-accent/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <Link href="/dashboard" className="absolute top-6 left-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" /> Dashboard
      </Link>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex p-5 bg-primary/10 rounded-3xl mb-4">
            <Store className="h-12 w-12 text-primary" />
          </div>
          <h1 className="font-brand text-4xl uppercase tracking-wide mb-2">Crea tu Negocio</h1>
          <p className="text-muted-foreground">
            Necesitamos el nombre de tu food truck para personalizar tu menú y QR.
          </p>
        </div>

        <form onSubmit={handleSetup} className="bg-card border border-border rounded-[2.5rem] p-8 space-y-5 shadow-2xl">
          <div>
            <label className="text-sm font-bold uppercase tracking-tighter pl-1 block mb-2">
              Nombre de tu Food Truck
            </label>
            <input
              type="text"
              required
              autoFocus
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Ej: Gorilla Burgers"
              className="w-full h-14 bg-muted rounded-2xl px-5 outline-none focus:ring-2 ring-primary/50 transition-all text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-2 pl-1">
              Este será el nombre visible para tus clientes.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !businessName.trim()}
            className="w-full h-14 bg-primary text-primary-foreground font-bold text-lg rounded-2xl hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" /> Creando...</>
            ) : (
              '🦍 Crear mi Food Truck'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
