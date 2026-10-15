import BrandMark from './BrandMark';
import InteractiveLogo from './InteractiveLogo';

/**
 * Crédito de autoría de Teo Labs: "Desarrollado por Θ Teo Labs ®".
 * Signo oficial (la Θ) fijo y el nombre animado con la tipografía de la marca
 * (Lexend Bold, espaciado apretado), igual que en el sitio de Teo Labs.
 */
export function TeoLabsCredit({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      Desarrollado por
      <a
        href="https://www.teolabs.app"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
      >
        <BrandMark title="" className="h-4 w-4 shrink-0" />
        <InteractiveLogo
          variant="footer-small"
          className="font-wordmark text-[14px] font-bold tracking-wordmark"
        />
      </a>
      ®
    </span>
  );
}
