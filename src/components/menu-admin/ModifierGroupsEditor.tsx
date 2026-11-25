'use client';

import { useEffect, useState } from 'react';
import { ChefHat, HelpCircle, Zap, Trash2, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatCLP } from '@/lib/utils';
import { mensajeParaPersona } from '@/lib/errores';
import {
  GROUP_PRESETS, createGroup, createOption, deleteGroup, deleteOption, fetchGroups,
  type GroupPreset, type ModifierGroupRow,
} from '@/lib/modifiers-data';

type ConfirmDelete = { kind: 'group' | 'option'; groupId: string; optionId?: string; name: string };

/**
 * "Personalización del producto": option groups the customer picks from when ordering
 * (sauces, cooking point, extras with a price). Lives inside the product modal.
 */
export function ModifierGroupsEditor({ tenantId, productId }: { tenantId: string; productId: string }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<ModifierGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'checkbox' | 'radio'>('checkbox');
  const [newGroupRequired, setNewGroupRequired] = useState(false);
  const [optionInputs, setOptionInputs] = useState<Record<string, { name: string; price: string }>>({});
  const [confirm, setConfirm] = useState<ConfirmDelete | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGroups(productId)
      .then(g => { if (!cancelled) { setGroups(g); setLoadError(''); } })
      .catch(e => { if (!cancelled) setLoadError(mensajeParaPersona(e, 'menú: opciones')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const failToast = (title: string, e: unknown) =>
    toast({ title, description: mensajeParaPersona(e, 'menú: opciones'), variant: 'destructive' });

  const addPreset = async (preset: GroupPreset) => {
    if (busy) return;
    setBusy(true);
    try {
      const g = await createGroup(tenantId, productId, preset, groups.length, preset.options);
      setGroups(prev => [...prev, g]);
      toast({ title: `✅ Grupo "${preset.name}" creado`, description: 'Puedes editar o agregar más opciones.' });
    } catch (e) {
      failToast('No se pudo crear el grupo', e);
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    if (!newGroupName.trim() || busy) return;
    setBusy(true);
    try {
      const g = await createGroup(tenantId, productId, { name: newGroupName.trim(), type: newGroupType, required: newGroupRequired }, groups.length);
      setGroups(prev => [...prev, g]);
      setNewGroupName('');
      setNewGroupRequired(false);
    } catch (e) {
      failToast('No se pudo crear el grupo', e);
    } finally {
      setBusy(false);
    }
  };

  const addOption = async (groupId: string) => {
    const input = optionInputs[groupId];
    if (!input?.name?.trim() || busy) return;
    setBusy(true);
    try {
      const group = groups.find(g => g.id === groupId);
      const opt = await createOption(tenantId, groupId, input.name.trim(), Number(input.price) || 0, group?.product_modifier_options.length ?? 0);
      setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, product_modifier_options: [...g.product_modifier_options, opt] } : g)));
      setOptionInputs(prev => ({ ...prev, [groupId]: { name: '', price: '' } }));
    } catch (e) {
      failToast('No se pudo agregar la opción', e);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'group') {
        await deleteGroup(confirm.groupId);
        setGroups(prev => prev.filter(g => g.id !== confirm.groupId));
      } else {
        await deleteOption(confirm.optionId!);
        setGroups(prev => prev.map(g => (g.id === confirm.groupId
          ? { ...g, product_modifier_options: g.product_modifier_options.filter(o => o.id !== confirm.optionId) }
          : g)));
      }
      setConfirm(null);
    } catch (e) {
      failToast(confirm.kind === 'group' ? 'No se pudo borrar el grupo' : 'No se pudo borrar la opción', e);
    } finally {
      setBusy(false);
    }
  };

  const setInput = (groupId: string, patch: Partial<{ name: string; price: string }>) =>
    setOptionInputs(prev => ({ ...prev, [groupId]: { ...{ name: '', price: '' }, ...prev[groupId], ...patch } }));

  return (
    <TooltipProvider>
      <div className="mt-2 border-t border-border pt-5">
        <div className="flex items-center gap-2 mb-1">
          <ChefHat className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-bold text-sm uppercase tracking-wider">Personalización del producto</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors" aria-label="¿Para qué sirve la personalización?">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs p-4 text-sm leading-relaxed">
              <p className="font-bold mb-2">¿Para qué sirve esto?</p>
              <p className="text-muted-foreground mb-3">Permite que el cliente personalice su pedido. La cocina ve las elecciones en cada orden.</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>🧴 <b>Salsas</b> — elige varias</li>
                <li>🔥 <b>Punto de cocción</b> — elige solo una</li>
                <li>🥑 <b>Sin ingredientes</b> — marca lo que no quiere</li>
                <li>🧀 <b>Extras con costo</b> — Queso extra (+$500)</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Salsas, extras, ingredientes a quitar — el cliente elige al pedir.</p>

        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground mb-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando opciones…</p>}
        {loadError && <p role="alert" className="text-sm font-semibold text-red-700 mb-4">{loadError}</p>}

        {!loading && !loadError && groups.length === 0 && (
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 mb-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Inicio rápido</span>
              <span className="text-xs text-muted-foreground">— Crea un grupo con un clic:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {GROUP_PRESETS.map(({ label, preset }) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy}
                  onClick={() => addPreset(preset)}
                  className="min-h-11 text-sm font-medium px-3 rounded-xl border border-primary/30 bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 mb-4">
          {groups.map(group => (
            <div key={group.id} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{group.name}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase font-bold">
                    {group.type === 'radio' ? '◉ Una opción' : '☑ Varias'}
                  </span>
                  {group.required && (
                    <span className="text-xs bg-amber-500/10 text-amber-800 px-2 py-0.5 rounded-full uppercase font-bold">⚠ Obligatorio</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'group', groupId: group.id, name: group.name })}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0 ml-2"
                  aria-label={`Borrar el grupo ${group.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {group.product_modifier_options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {group.product_modifier_options.map(opt => (
                    <span key={opt.id} className="flex items-center gap-1 bg-background border border-border/60 rounded-full pl-2.5 pr-1 py-1 text-xs font-medium">
                      {opt.name}
                      {Number(opt.price_delta) !== 0 && (
                        <span className="text-primary font-bold ml-0.5">{Number(opt.price_delta) > 0 ? '+' : ''}{formatCLP(Number(opt.price_delta))}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: 'option', groupId: group.id, optionId: opt.id, name: opt.name })}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Borrar la opción ${opt.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-3 italic">Sin opciones aún — agrega la primera abajo.</p>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de la opción (ej: Mayonesa)"
                  aria-label={`Nueva opción para ${group.name}`}
                  className="h-11 text-sm rounded-xl"
                  value={optionInputs[group.id]?.name || ''}
                  onChange={e => setInput(group.id, { name: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addOption(group.id)}
                />
                <Input
                  placeholder="$0"
                  aria-label="Costo extra en pesos (0 = gratis)"
                  inputMode="numeric"
                  className="h-11 text-sm rounded-xl w-20 text-center"
                  value={optionInputs[group.id]?.price || ''}
                  onChange={e => setInput(group.id, { price: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && addOption(group.id)}
                />
                <Button size="sm" variant="outline" className="h-11 rounded-xl px-3 shrink-0" onClick={() => addOption(group.id)} disabled={busy}>
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-dashed border-border p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {groups.length > 0 ? '+ Crear otro grupo' : 'O crea un grupo personalizado'}
          </p>
          <Input
            placeholder="Nombre del grupo (ej: Salsas, Punto de cocción, Extras…)"
            aria-label="Nombre del grupo nuevo"
            className="h-11 text-sm rounded-xl"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
          />
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={newGroupType}
              onChange={e => setNewGroupType(e.target.value as 'checkbox' | 'radio')}
              aria-label="Cuántas opciones puede elegir el cliente"
              className="flex-1 min-w-[160px] h-11 bg-background border border-border rounded-xl px-3 text-sm cursor-pointer"
            >
              <option value="checkbox">☑ Elige varias (ej: Salsas)</option>
              <option value="radio">◉ Elige una (ej: Punto de cocción)</option>
            </select>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={newGroupRequired} onChange={e => setNewGroupRequired(e.target.checked)} className="h-4 w-4 rounded" />
              Obligatorio
            </label>
            <Button size="sm" className="h-11 rounded-xl gap-1.5" onClick={addGroup} disabled={!newGroupName.trim() || busy}>
              <Plus className="h-3.5 w-3.5" /> Crear grupo
            </Button>
          </div>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl space-y-4">
            <h2 id="confirm-delete-title" className="font-brand text-xl tracking-wide">
              {confirm.kind === 'group' ? '¿Borrar este grupo?' : '¿Borrar esta opción?'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {confirm.kind === 'group'
                ? <>Se borra <strong className="text-foreground">“{confirm.name}”</strong> con todas sus opciones. Los pedidos ya hechos no cambian.</>
                : <>Se borra <strong className="text-foreground">“{confirm.name}”</strong>. Los pedidos ya hechos no cambian.</>}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy} className="min-h-11">Volver</Button>
              <Button onClick={confirmAndDelete} disabled={busy} className="min-h-11 bg-red-700 text-white hover:bg-red-800">
                {busy ? 'Borrando…' : 'Sí, borrar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}
