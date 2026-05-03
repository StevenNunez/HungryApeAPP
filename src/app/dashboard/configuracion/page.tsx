'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, Save, Image as ImageIcon, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function ConfigurationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: tData } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_id', user.id)
        .single();

      if (tData) setTenant(tData);
      setLoading(false);
    }
    loadData();
  }, [router]);

  const handleUpdateTenant = async () => {
    if (!tenant) return;
    setSaving(true);
    const supabase = createClient();
    
    // address is used for both address and slogan in the current schema
    const { error } = await supabase
      .from('tenants')
      .update({
        name: tenant.name,
        description: tenant.description,
        address: tenant.address,
        logo_url: tenant.logo_url,
        phone: tenant.phone,
        transfer_bank: tenant.transfer_bank,
        transfer_account_type: tenant.transfer_account_type,
        transfer_account_number: tenant.transfer_account_number,
        transfer_rut: tenant.transfer_rut,
        transfer_email: tenant.transfer_email
      })
      .eq('id', tenant.id);

    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Perfil actualizado', description: 'Tus datos se guardaron correctamente.' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex-1 flex justify-center py-20">
        <p>No se encontró negocio asociado a tu cuenta.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6 sm:p-10 animate-in fade-in duration-500">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="font-brand text-4xl tracking-wide uppercase">Configuración</h1>
            <p className="text-muted-foreground text-sm font-medium">Revisa y actualiza el perfil de tu Food Truck.</p>
          </div>
        </div>

        <Card className="rounded-[2.5rem] border-transparent shadow-2xl bg-card overflow-hidden">
          <CardHeader className="bg-muted p-8 border-b border-border text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-background shadow-lg">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt="Logo" className="w-full h-full object-cover rounded-full" />
              ) : (
                <Store className="h-8 w-8 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl font-brand uppercase">Perfil Público</CardTitle>
            <CardDescription>Esta información aparecerá en tu menú y al momento de cobrar.</CardDescription>
          </CardHeader>

          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Nombre Comercial</label>
                  <Input value={tenant.name || ''} onChange={e => setTenant({ ...tenant, name: e.target.value })} className="rounded-xl h-12" />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Descripción corta</label>
                  <textarea
                    className="w-full h-32 bg-background border border-input rounded-xl p-4 focus:ring-2 ring-primary/50 outline-none resize-none text-sm"
                    value={tenant.description || ''}
                    onChange={e => setTenant({ ...tenant, description: e.target.value })}
                    placeholder="Describe tu food truck en una frase..."
                  />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Dirección / Slogan</label>
                  <Input value={tenant.address || ''} onChange={e => setTenant({ ...tenant, address: e.target.value })} className="rounded-xl h-12" />
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">URL del Logo</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={tenant.logo_url || ''}
                      onChange={e => setTenant({ ...tenant, logo_url: e.target.value })}
                      placeholder="https://..."
                      className="rounded-xl h-12 pl-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">WhatsApp de contacto</label>
                  <Input
                    value={tenant.phone || ''}
                    onChange={e => setTenant({ ...tenant, phone: e.target.value })}
                    placeholder="+569 1234 5678"
                    className="rounded-xl h-12"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2.5rem] border-transparent shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-muted/50 p-8 border-b border-border">
            <CardTitle className="text-xl font-brand uppercase text-primary">Cuentas Bancarias</CardTitle>
            <CardDescription>Datos para transferencias cuando elijen ese método de pago.</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Banco</label>
                  <Input placeholder="Ej: Banco de Chile" value={tenant.transfer_bank || ''} onChange={e => setTenant({ ...tenant, transfer_bank: e.target.value })} className="rounded-xl h-12" />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Tipo de Cuenta</label>
                  <Input placeholder="Ej: Cuenta Corriente" value={tenant.transfer_account_type || ''} onChange={e => setTenant({ ...tenant, transfer_account_type: e.target.value })} className="rounded-xl h-12" />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Número de Cuenta</label>
                  <Input placeholder="Ej: 123456789" value={tenant.transfer_account_number || ''} onChange={e => setTenant({ ...tenant, transfer_account_number: e.target.value })} className="rounded-xl h-12" />
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">RUT / Identificación</label>
                  <Input placeholder="Ej: 76.543.210-K" value={tenant.transfer_rut || ''} onChange={e => setTenant({ ...tenant, transfer_rut: e.target.value })} className="rounded-xl h-12" />
                </div>
                <div>
                  <label className="text-sm font-bold uppercase pl-1 block mb-1.5">Correo de comprobante</label>
                  <Input type="email" placeholder="Ej: pagos@mitruck.cl" value={tenant.transfer_email || ''} onChange={e => setTenant({ ...tenant, transfer_email: e.target.value })} className="rounded-xl h-12" />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-return pt-6 border-t border-border">
              <Button onClick={handleUpdateTenant} disabled={saving} className="rounded-2xl h-14 px-10 font-bold gap-2 text-lg active:scale-95 shadow-md">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Guardar Configuración
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
