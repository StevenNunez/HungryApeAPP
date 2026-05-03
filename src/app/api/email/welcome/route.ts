import { NextRequest, NextResponse } from 'next/server';
import { sendWelcomeEmail, type PlanId } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { to, businessName, planId } = await request.json();

    if (!to || !businessName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await sendWelcomeEmail({
      to,
      businessName,
      planId: (planId as PlanId) ?? 'gratis',
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('❌ Welcome email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
