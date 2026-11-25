import { createClient } from '@/lib/supabase/client';
import type { CajaOrder, CashSession, Withdrawal } from '@/lib/caja';

/**
 * Cash register queries (browser client, RLS: owner and manager of the business).
 * Every function THROWS on a network/DB error, so the screen can tell
 * "it failed" from "there is nothing".
 */

const ORDER_COLUMNS = 'id, nickname, short_id, payment_method, total, status, created_at';

function fail(what: string, error: { message: string }): never {
  throw Object.assign(new Error(`${what}: ${error.message}`), { cause: error });
}

export async function fetchOpenSession(tenantId: string): Promise<CashSession | null> {
  const { data, error } = await createClient()
    .from('cash_sessions').select('*').eq('tenant_id', tenantId).eq('status', 'open').maybeSingle();
  if (error) fail('caja abierta', error);
  return (data as CashSession | null) ?? null;
}

export async function fetchClosedSessions(tenantId: string, limit = 20): Promise<CashSession[]> {
  const { data, error } = await createClient()
    .from('cash_sessions').select('*').eq('tenant_id', tenantId).eq('status', 'closed')
    .order('closed_at', { ascending: false }).limit(limit);
  if (error) fail('historial de caja', error);
  return (data as CashSession[]) ?? [];
}

/** Paid orders (not "Por Pagar", not cancelled) placed while the session was open. */
export async function fetchSessionOrders(tenantId: string, sess: Pick<CashSession, 'opened_at' | 'closed_at'>): Promise<CajaOrder[]> {
  let q = createClient()
    .from('orders').select(ORDER_COLUMNS)
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("Por Pagar","Cancelado")')
    .gte('created_at', sess.opened_at);
  if (sess.closed_at) q = q.lte('created_at', sess.closed_at);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) fail('pedidos de la caja', error);
  return (data as CajaOrder[]) ?? [];
}

export async function fetchWithdrawals(sessionId: string): Promise<Withdrawal[]> {
  const { data, error } = await createClient()
    .from('cash_withdrawals').select('*').eq('session_id', sessionId).order('created_at', { ascending: false });
  if (error) fail('egresos', error);
  return (data as Withdrawal[]) ?? [];
}

export async function openSession(tenantId: string, openingAmount: number): Promise<CashSession> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Tu sesión expiró. Vuelve a ingresar para seguir.');
  const { data, error } = await supabase.from('cash_sessions').insert({
    tenant_id: tenantId,
    opened_by: user.id,
    opening_amount: openingAmount,
  }).select().single();
  if (error) {
    // The unique index allows one open session per business
    if (error.code === '23505') throw new Error('Ya hay una caja abierta en este local. Recarga la página.');
    fail('abrir caja', error);
  }
  return data as CashSession;
}

export async function addWithdrawal(tenantId: string, sessionId: string, amount: number, reason: string): Promise<void> {
  const { error } = await createClient().from('cash_withdrawals').insert({
    session_id: sessionId,
    tenant_id: tenantId,
    amount,
    reason,
  });
  if (error) fail('registrar egreso', error);
}

export async function closeSession(sessionId: string, closingAmount: number, notes: string): Promise<void> {
  const { error } = await createClient().from('cash_sessions').update({
    status: 'closed',
    closed_at: new Date().toISOString(),
    closing_amount: closingAmount,
    notes,
  }).eq('id', sessionId).eq('status', 'open');
  if (error) fail('cerrar caja', error);
}
