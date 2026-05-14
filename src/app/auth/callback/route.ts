import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback
 *
 * Handles both email confirmation links and OAuth redirects.
 * Supabase sends `?code=...` which must be exchanged server-side for a session.
 * On success, redirects to `?next=` (default: /dashboard).
 * On failure, redirects to /login?error=...
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');

  // Surface OAuth errors (e.g. user denied Google access)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('Auth callback exchange error:', exchangeError.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
