import { TeoLabsCredit } from '@/components/compartido/TeoLabsCredit';
import { DashboardNav } from '@/components/compartido/DashboardNav';
import { PanelAccessGate } from '@/components/compartido/PanelAccessGate';
import { TenantProvider } from '@/hooks/useTenant';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadMembership, type Membership } from '@/lib/roles';

/**
 * The business is read here, once, on the server: every panel page receives it
 * already loaded (TenantProvider) instead of fetching user → business on its own.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  let membership: Membership | null = null;
  let failed = false;
  if (user) {
    try {
      membership = await loadMembership(supabase, user.id);
    } catch {
      failed = true; // a network hiccup must not look like "no business": the browser retries
    }
  }

  return (
    <TenantProvider
      initialTenant={membership?.blocked ? null : membership?.tenant ?? null}
      initialBlocked={!!membership?.blocked}
      initialRole={membership?.role ?? null}
      initialUserEmail={user?.email ?? null}
      signedIn={!!user}
      retryOnClient={failed}
    >
      {/* pb-24: room for the fixed navigation bar */}
      <div className="pb-24">
        <PanelAccessGate>{children}</PanelAccessGate>
        <div className="flex justify-center border-t border-border bg-background py-4">
          <TeoLabsCredit />
        </div>
      </div>
      <DashboardNav />
    </TenantProvider>
  );
}
