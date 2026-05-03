'use client';

import { useTenant } from '@/hooks/useTenant';
import { TenantGate } from '@/components/compartido/TenantGate';
import { QRCodeSVG } from 'qrcode.react';
import { Download, ExternalLink, ChevronLeft, QrCode } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function QRAdminPage() {
  const { tenant, status, error } = useTenant();

  if (status !== 'found') {
    return <TenantGate status={status} error={error} />;
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const menuUrl = `${baseUrl}/m/${tenant.slug}`;

  const downloadQR = () => {
    const svg = document.getElementById('qr-to-download');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      ctx?.drawImage(img, 0, 0, 1000, 1000);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR-Menu-${tenant.slug}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="min-h-screen bg-muted/20 p-6 sm:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <Link href="/dashboard" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground mb-4 transition-colors">
            <ChevronLeft className="h-4 w-4" /> Volver al Dashboard
          </Link>
          <h1 className="font-brand text-4xl uppercase tracking-tighter">
            Mi Código <span className="text-primary italic">QR</span>
          </h1>
          <p className="text-muted-foreground">Tus clientes escanean este código para ver tu menú y pedir.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* QR Card */}
          <Card className="rounded-[3rem] border-0 shadow-2xl overflow-hidden bg-white dark:bg-card">
            <CardHeader className="bg-primary pt-12 pb-20 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-10 flex flex-wrap gap-4 p-4 pointer-events-none rotate-12 overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <span key={i} className="text-4xl">🍌</span>
                ))}
              </div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-0.5 bg-white px-4 py-2 rounded-full mb-4 shadow-xl">
                  <span className="font-brand text-primary text-xl tracking-wider">HUNGRY</span>
                  <span className="text-xl mx-0.5">🍌</span>
                  <span className="font-brand text-primary text-xl tracking-wider">APE</span>
                </div>
                <CardTitle className="text-white text-2xl font-brand uppercase tracking-widest">
                  {tenant.name}
                </CardTitle>
                <CardDescription className="text-white/80 font-bold uppercase text-xs mt-1">
                  Escanea y Pide Aquí
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="-mt-12 relative z-20 flex flex-col items-center pb-8">
              <div className="p-5 bg-white rounded-[2rem] shadow-2xl mb-6">
                <QRCodeSVG
                  id="qr-to-download"
                  value={menuUrl}
                  size={260}
                  level="H"
                  includeMargin={false}
                  imageSettings={{
                    src: 'https://em-content.zobj.net/source/apple/354/banana_1f34c.png',
                    height: 44,
                    width: 44,
                    excavate: true,
                  }}
                />
              </div>
              <div className="text-center px-6">
                <p className="text-xs text-muted-foreground font-medium mb-2">Enlace directo:</p>
                <code className="bg-muted px-4 py-2 rounded-xl text-xs font-mono select-all block break-all text-primary">
                  {menuUrl}
                </code>
              </div>
            </CardContent>
          </Card>

          {/* Actions + Tips */}
          <div className="space-y-6">
            <Card className="rounded-[2.5rem] border-border/50">
              <CardHeader>
                <CardTitle className="text-xl">Opciones de descarga</CardTitle>
                <CardDescription>Para imprimir en tu local o mesas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={downloadQR} className="w-full h-14 rounded-2xl gap-2 font-bold text-base active:scale-95">
                  <Download className="h-5 w-5" /> Descargar para Imprimir
                </Button>
                <Link href={menuUrl} target="_blank" className="block">
                  <Button variant="outline" className="w-full h-14 rounded-2xl gap-2 font-bold border-dashed">
                    <ExternalLink className="h-5 w-5" /> Ver menú como cliente
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="rounded-[2.5rem] bg-accent/10 border-accent/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Consejos Pro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm font-medium">
                <p>🍌 Coloca el QR en cada mesa para más ventas.</p>
                <p>🦍 Úsalo en redes sociales para pedidos directos.</p>
                <p>📸 Asegúrate que la impresión sea de buena calidad.</p>
                <p>🎯 Mínimo 5×5cm para que los teléfonos lo lean bien.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
