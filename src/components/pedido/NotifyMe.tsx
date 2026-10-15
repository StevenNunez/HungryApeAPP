'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

type PushState = 'checking' | 'unsupported' | 'idle' | 'working' | 'on' | 'denied';

/**
 * "Avísame cuando esté listo": web push (free, any browser) and/or a WhatsApp chat
 * (free: the customer opens the conversation). Rendered only for Pro businesses.
 */
export function NotifyMe({ orderId }: { orderId: string }) {
  const { toast } = useToast();
  const [push, setPush] = useState<PushState>('checking');
  const [waLoading, setWaLoading] = useState(false);
  const [waOpened, setWaOpened] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const pushAvailable = !!VAPID_PUBLIC_KEY;
  const waAvailable = !!WHATSAPP_NUMBER;

  useEffect(() => {
    if (!pushAvailable) { setPush('unsupported'); return; }
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (isIos && !standalone) setIosHint(true);
    if (!supported) { setPush('unsupported'); return; }
    if (Notification.permission === 'denied') { setPush('denied'); return; }

    // Already subscribed on this device for this order?
    try {
      if (sessionStorage.getItem(`ha_push_${orderId}`) === '1') { setPush('on'); return; }
    } catch { /* storage may be blocked */ }
    setPush('idle');
  }, [orderId, pushAvailable]);

  const enablePush = async () => {
    setPush('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPush(permission === 'denied' ? 'denied' : 'idle'); return; }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, subscription: subscription.toJSON() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'No se pudo activar');

      try { sessionStorage.setItem(`ha_push_${orderId}`, '1'); } catch { /* ignore */ }
      setPush('on');
      toast({ title: '🔔 Aviso activado', description: 'Te avisaremos en este dispositivo cuando tu pedido esté listo.' });
    } catch (err: any) {
      console.error('enablePush', err);
      setPush('idle');
      toast({ title: 'No se pudo activar el aviso', description: err?.message, variant: 'destructive' });
    }
  };

  const openWhatsApp = async () => {
    setWaLoading(true);
    try {
      const res = await fetch('/api/whatsapp/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'No se pudo abrir WhatsApp');
      setWaOpened(true);
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast({ title: 'WhatsApp no disponible', description: err?.message, variant: 'destructive' });
    } finally {
      setWaLoading(false);
    }
  };

  if (!pushAvailable && !waAvailable) return null;
  if (push === 'checking' && !waAvailable) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-5 px-5 space-y-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          <p className="font-bold text-sm">¿No quieres esperar mirando la pantalla?</p>
        </div>
        <p className="text-xs text-muted-foreground">Te avisamos apenas tu pedido esté listo.</p>

        <div className="flex flex-col sm:flex-row gap-2">
          {pushAvailable && push !== 'unsupported' && (
            <Button
              onClick={enablePush}
              disabled={push === 'working' || push === 'on' || push === 'denied' || push === 'checking'}
              variant={push === 'on' ? 'secondary' : 'default'}
              className="rounded-xl flex-1"
            >
              {push === 'working' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : push === 'on' ? <Check className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
              {push === 'on' ? 'Aviso activado' : push === 'denied' ? 'Notificaciones bloqueadas' : 'Avisarme en este celular'}
            </Button>
          )}
          {waAvailable && (
            <Button onClick={openWhatsApp} disabled={waLoading} variant="outline" className="rounded-xl flex-1">
              {waLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
              {waOpened ? 'Abrir WhatsApp de nuevo' : 'Avisarme por WhatsApp'}
            </Button>
          )}
        </div>

        {waOpened && (
          <p className="text-xs text-muted-foreground">
            En WhatsApp, toca <strong>Enviar</strong> en el mensaje que se preparó: así nos autorizas a avisarte.
          </p>
        )}
        {push === 'denied' && (
          <p className="text-xs text-amber-600">Bloqueaste las notificaciones de este sitio. Puedes activarlas desde la configuración del navegador.</p>
        )}
        {iosHint && pushAvailable && (
          <p className="text-xs text-muted-foreground">
            En iPhone, para recibir avisos primero agrega esta página a tu pantalla de inicio (Compartir → Agregar a inicio).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
