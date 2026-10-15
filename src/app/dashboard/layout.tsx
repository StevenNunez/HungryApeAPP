import { TeoLabsCredit } from '@/components/compartido/TeoLabsCredit';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="flex justify-center border-t border-border bg-background py-4">
        <TeoLabsCredit />
      </div>
    </>
  );
}
