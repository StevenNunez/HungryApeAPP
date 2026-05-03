import { NextRequest, NextResponse } from 'next/server';
import { PreApproval } from 'mercadopago';
import { mercadoPagoClient } from '@/lib/mercadopago';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/cron/check-subscriptions
 * 
 * Synchronizes the status of all active/pending subscriptions with Mercado Pago.
 * Prevents logic gaps if webhooks were missed.
 */
export async function GET(request: NextRequest) {
  // Check for auth (Vercel Cron Secret or simple header) if needed
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  
  // Find tenants that are not 'free' and have a subscription_payment_id
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, subscription_payment_id, subscription_status')
    .not('subscription_payment_id', 'is', null)
    .not('plan_id', 'eq', 'gratis');

  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ message: 'No active subscriptions to check' });
  }

  const preapprovalApi = new PreApproval(mercadoPagoClient);
  const results = [];

  for (const tenant of tenants) {
    try {
      const subData = await preapprovalApi.get({ id: tenant.subscription_payment_id! });
      
      let newStatus = 'inactive';
      if (subData.status === 'authorized' || subData.status === 'approved') newStatus = 'active';
      if (subData.status === 'paused') newStatus = 'paused';
      if (subData.status === 'cancelled') newStatus = 'cancelled';

      if (newStatus !== tenant.subscription_status) {
        await supabase
          .from('tenants')
          .update({ 
            subscription_status: newStatus,
            subscription_updated_at: new Date().toISOString()
          })
          .eq('id', tenant.id);
        
        results.push({ tenantId: tenant.id, old: tenant.subscription_status, new: newStatus });
      }
    } catch (err) {
      console.error(`Error checking sub for tenant ${tenant.id}:`, err);
    }
  }

  return NextResponse.json({ 
    checked: tenants.length, 
    updated: results.length,
    changes: results 
  });
}
