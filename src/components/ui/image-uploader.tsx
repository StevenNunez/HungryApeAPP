'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Upload, X, Loader2, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Client-side compression via Canvas ──────────────────────────────────────
async function compressImage(file: File, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Compresión fallida')),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo cargar la imagen')); };
    img.src = objectUrl;
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ImageUploaderProps {
  value: string | null | undefined;
  onChange: (url: string) => void;
  /** Storage path prefix, e.g. "tenantId/products" or "tenantId/logo" */
  uploadPath: string;
  /** Max width in px before compression (default 800) */
  maxWidth?: number;
  /** JPEG quality 0–1 (default 0.80) */
  quality?: number;
  /** Visual aspect ratio of the preview box */
  aspectRatio?: 'square' | 'video';
  placeholder?: string;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ImageUploader({
  value,
  onChange,
  uploadPath,
  maxWidth = 800,
  quality = 0.80,
  aspectRatio = 'video',
  placeholder = 'Subir imagen',
  className,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [urlMode, setUrlMode]     = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload flow ─────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Selecciona un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('La imagen es demasiado grande. Máximo 10 MB.');
      return;
    }

    setUploading(true);
    try {
      const blob     = await compressImage(file, maxWidth, quality);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const fullPath = `${uploadPath}/${filename}`;

      const supabase = createClient();
      const { error } = await supabase.storage
        .from('images')
        .upload(fullPath, blob, { contentType: 'image/jpeg', upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fullPath);
      onChange(publicUrl);
    } catch (err: any) {
      console.error('Image upload error:', err);
      alert(`Error al subir: ${err.message ?? 'inténtalo de nuevo'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualUrl = () => {
    const url = manualUrl.trim();
    if (url) { onChange(url); setManualUrl(''); setUrlMode(false); }
  };

  const paddingBottom = aspectRatio === 'square' ? 'pb-[100%]' : 'pb-[75%]';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={cn('space-y-2', className)}>

      {/* Preview / drop zone */}
      <div className={cn(
        'relative w-full rounded-2xl overflow-hidden border-2 border-dashed transition-colors',
        value ? 'border-transparent' : 'border-border hover:border-primary/50 cursor-pointer',
      )}
        onClick={!value ? () => fileInputRef.current?.click() : undefined}
      >
        <div className={cn('relative w-full', paddingBottom)}>
          {value ? (
            <div className="absolute inset-0">
              <img src={value} alt="preview" className="w-full h-full object-cover" />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/90 disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? 'Subiendo…' : 'Cambiar'}
                </button>
                <button
                  type="button"
                  onClick={() => onChange('')}
                  disabled={uploading}
                  className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-red-600 disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" /> Quitar
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/40 hover:bg-muted/70 transition-colors">
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Comprimiendo y subiendo…</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">{placeholder}</span>
                  <span className="text-[11px] text-muted-foreground/60">JPG · PNG · WEBP — se comprime automáticamente</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* URL manual toggle */}
      {!urlMode ? (
        <button
          type="button"
          onClick={() => setUrlMode(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <LinkIcon className="h-3 w-3" /> Usar URL externa
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            type="url"
            autoFocus
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualUrl(); } }}
            placeholder="https://..."
            className="flex-1 h-9 bg-muted rounded-xl px-3 text-sm outline-none focus:ring-2 ring-primary/50"
          />
          <button type="button" onClick={handleManualUrl} className="text-xs font-bold bg-primary text-primary-foreground px-3 rounded-lg hover:bg-primary/90">
            OK
          </button>
          <button type="button" onClick={() => { setUrlMode(false); setManualUrl(''); }} className="text-xs text-muted-foreground px-2 hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />
    </div>
  );
}
