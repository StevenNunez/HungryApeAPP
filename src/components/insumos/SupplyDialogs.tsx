'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNIT_LABEL, formatQty, parseQty, purchaseToBase, type BuyFormat, type Supply, type SupplyUnit } from '@/lib/insumos';
import type { SupplyInput } from '@/lib/insumos-data';

const UNITS: SupplyUnit[] = ['unidad', 'g', 'ml'];

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

/** Create or edit a supply (name, unit, minimum, target and cost per unit). */
export function SupplyFormDialog({
  open, supply, busy, onClose, onSave,
}: {
  open: boolean;
  supply: Supply | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: SupplyInput, initialStock: number) => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<SupplyUnit>('unidad');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState('');
  const [target, setTarget] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(supply?.name ?? '');
    setUnit(supply?.unit ?? 'unidad');
    setStock('');
    setMin(supply ? String(supply.min_stock) : '');
    setTarget(supply?.target_stock != null ? String(supply.target_stock) : '');
    // Cost is typed per kilo / litre for grams and ml (what people actually pay)
    setCost(supply?.cost_per_unit != null
      ? String(supply.unit === 'unidad' ? supply.cost_per_unit : Math.round(supply.cost_per_unit * 1000))
      : '');
    setError('');
  }, [open, supply]);

  const unitWord = unit === 'unidad' ? 'unidades' : unit;

  const submit = () => {
    if (!name.trim()) return setError('Escribe el nombre del insumo.');
    const minN = min.trim() === '' ? 0 : parseQty(min);
    const targetN = target.trim() === '' ? null : parseQty(target);
    const costN = cost.trim() === '' ? null : parseQty(cost);
    const stockN = stock.trim() === '' ? 0 : parseQty(stock);
    if ([minN, stockN].some(v => v === null || v < 0) || (targetN !== null && targetN < 0) || (costN !== null && costN < 0)) {
      return setError('Revisa los números: no pueden ser negativos.');
    }
    setError('');
    const costPerBase = costN === null ? null : unit === 'unidad' ? costN : costN / 1000;
    onSave({ name: name.trim(), unit, min_stock: minN!, target_stock: targetN, cost_per_unit: costPerBase }, stockN!);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && !busy && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>{supply ? `Editar ${supply.name}` : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>Lo que usas para preparar: pan, salchichas, palta, salsas, envases…</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field id="insumo-nombre" label="Nombre">
            <Input id="insumo-nombre" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Pan de completo" maxLength={60} className="h-11" />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Se mide en</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {UNITS.map(u => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  disabled={!!supply}
                  onClick={() => setUnit(u)}
                  className={`min-h-11 rounded-xl border-2 text-sm font-semibold disabled:opacity-60 ${unit === u ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
            {supply
              ? <p className="text-xs text-muted-foreground mt-1">La unidad no se cambia: las recetas dependen de ella.</p>
              : <p className="text-xs text-muted-foreground mt-1">Palta, carne o papas en gramos; salsas y bebidas a granel en ml; pan y salchichas en unidades.</p>}
          </fieldset>
          {!supply && (
            <Field id="insumo-stock" label={`Stock actual (${unitWord})`} hint="Lo que tienes hoy. Después se mueve solo con las ventas.">
              <Input id="insumo-stock" inputMode="decimal" value={stock} onChange={e => setStock(e.target.value)} placeholder="Ej: 40" className="h-11" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="insumo-min" label={`Avisar bajo (${unitWord})`}>
              <Input id="insumo-min" inputMode="decimal" value={min} onChange={e => setMin(e.target.value)} placeholder="Ej: 10" className="h-11" />
            </Field>
            <Field id="insumo-obj" label={`Reponer hasta (${unitWord})`}>
              <Input id="insumo-obj" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Ej: 60" className="h-11" />
            </Field>
          </div>
          <Field id="insumo-costo" label={`Costo por ${unit === 'unidad' ? 'unidad' : unit === 'g' ? 'kilo' : 'litro'} (CLP)`} hint="Opcional: con el costo, cada receta calcula su margen real.">
            <Input id="insumo-costo" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="Opcional" className="h-11" />
          </Field>
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy} className="min-h-11">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="min-h-11 font-bold">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type MovementKind = 'compra' | 'merma' | 'ajuste';

const COPY: Record<MovementKind, { title: string; qty: string; hint: string; cta: string }> = {
  compra: { title: 'Registrar compra', qty: 'Cantidad que compraste', hint: 'Se suma al stock.', cta: 'Sumar al stock' },
  merma: { title: 'Registrar merma', qty: 'Cantidad perdida', hint: 'Lo que se botó, venció o se quemó. Se resta del stock.', cta: 'Restar del stock' },
  ajuste: { title: 'Conteo físico', qty: 'Lo que contaste', hint: 'Reemplaza el stock por lo que hay realmente en el carro.', cta: 'Guardar conteo' },
};

/** Purchase, waste or physical count of one supply. */
export function MovementDialog({
  supply, kind, busy, onClose, onSave,
}: {
  supply: Supply | null;
  kind: MovementKind;
  busy: boolean;
  onClose: () => void;
  onSave: (quantity: number, unitCost: number | null, note: string | null) => void;
}) {
  const [qty, setQty] = useState('');
  const [format, setFormat] = useState<BuyFormat>('base');
  const [packSize, setPackSize] = useState('');
  const [price, setPrice] = useState('');
  const [priceIsTotal, setPriceIsTotal] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setQty(''); setPrice(''); setNote(''); setError(''); setPackSize('');
    setFormat(supply && supply.unit !== 'unidad' && kind === 'compra' ? 'grande' : 'base');
    setPriceIsTotal(true);
  }, [supply, kind]);

  if (!supply) return null;
  const c = COPY[kind];
  const baseWord = supply.unit === 'unidad' ? 'unidades' : supply.unit;
  const bigWord = supply.unit === 'g' ? 'kilos' : 'litros';
  const isBuy = kind === 'compra';
  const fmt: BuyFormat = isBuy ? format : 'base';
  const amountLabel = fmt === 'grande' ? bigWord : fmt === 'pack' ? 'paquetes o cajas' : baseWord;

  const amountN = parseQty(qty);
  const packN = packSize.trim() === '' ? null : parseQty(packSize);
  const priceN = price.trim() === '' ? null : parseQty(price);
  const preview = isBuy && amountN !== null && amountN > 0 && (fmt !== 'pack' || (packN ?? 0) > 0)
    ? purchaseToBase(supply.unit, fmt, amountN, packN, priceN, priceIsTotal)
    : null;

  const submit = () => {
    if (amountN === null || amountN < 0 || (kind !== 'ajuste' && amountN === 0)) return setError('Escribe una cantidad válida.');
    if (fmt === 'pack' && (packN === null || packN <= 0)) return setError('¿Cuántas trae cada paquete?');
    if (priceN !== null && priceN < 0) return setError('El precio no puede ser negativo.');
    setError('');
    if (!isBuy) return onSave(amountN, null, note.trim() || null);
    const { quantity, unitCost } = purchaseToBase(supply.unit, fmt, amountN, packN, priceN, priceIsTotal);
    onSave(quantity, unitCost, note.trim() || null);
  };

  const formats: { id: BuyFormat; label: string }[] = [
    { id: 'base', label: supply.unit === 'unidad' ? 'Por unidad' : `En ${supply.unit}` },
    ...(supply.unit !== 'unidad' ? [{ id: 'grande' as const, label: `En ${bigWord}` }] : []),
    { id: 'pack', label: 'Paquetes / cajas' },
  ];

  return (
    <Dialog open={!!supply} onOpenChange={v => !v && !busy && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>{c.title}: {supply.name}</DialogTitle>
          <DialogDescription>Hoy hay {formatQty(supply.stock, supply.unit)}. {c.hint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {isBuy && (
            <fieldset>
              <legend className="text-sm font-medium mb-1.5">¿Cómo lo compraste?</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {formats.map(f => (
                  <button key={f.id} type="button" role="radio" aria-checked={format === f.id} onClick={() => setFormat(f.id)}
                    className={`min-h-11 rounded-xl border-2 px-1 text-xs font-semibold ${format === f.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className={fmt === 'pack' ? 'grid grid-cols-2 gap-2' : ''}>
            <Field id="mov-qty" label={`${c.qty} (${amountLabel})`}>
              <Input id="mov-qty" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} autoFocus className="h-12 text-lg" />
            </Field>
            {fmt === 'pack' && (
              <Field id="mov-pack" label={`Cada uno trae (${baseWord})`}>
                <Input id="mov-pack" inputMode="decimal" value={packSize} onChange={e => setPackSize(e.target.value)} placeholder="Ej: 24" className="h-12 text-lg" />
              </Field>
            )}
          </div>
          {isBuy && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="mov-price" className="text-sm font-medium">Precio (opcional)</label>
                <div className="flex rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label="El precio es">
                  <button type="button" role="radio" aria-checked={priceIsTotal} onClick={() => setPriceIsTotal(true)} className={`min-h-9 rounded-md px-2 font-semibold ${priceIsTotal ? 'bg-background shadow-sm' : ''}`}>Total</button>
                  <button type="button" role="radio" aria-checked={!priceIsTotal} onClick={() => setPriceIsTotal(false)} className={`min-h-9 rounded-md px-2 font-semibold ${!priceIsTotal ? 'bg-background shadow-sm' : ''}`}>
                    Por {fmt === 'grande' ? (supply.unit === 'g' ? 'kilo' : 'litro') : fmt === 'pack' ? 'paquete' : supply.unit === 'unidad' ? 'unidad' : supply.unit}
                  </button>
                </div>
              </div>
              <Input id="mov-price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="Ej: 8000" className="h-11" />
              <p className="text-xs text-muted-foreground mt-1">Si lo escribes, actualiza el costo de tus recetas.</p>
            </div>
          )}
          {preview && (
            <p role="status" className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
              Suma <strong>{formatQty(preview.quantity, supply.unit)}</strong>
              {preview.unitCost !== null && <> · costo <strong>${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(preview.unitCost)}</strong> por {supply.unit === 'unidad' ? 'unidad' : supply.unit}</>}
            </p>
          )}
          <Field id="mov-note" label="Nota (opcional)">
            <Input id="mov-note" value={note} onChange={e => setNote(e.target.value)} maxLength={120} placeholder={kind === 'merma' ? 'Ej: se venció' : kind === 'compra' ? 'Ej: Panadería San José' : 'Ej: cierre del día'} className="h-11" />
          </Field>
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy} className="min-h-11">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="min-h-11 font-bold">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{c.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
