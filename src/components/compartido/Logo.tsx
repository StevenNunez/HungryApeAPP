import Link from 'next/link';

/**
 * Hungry Ape logo — matches the official brand banner:
 *  - Luckiest Guy font (cartoon bold)
 *  - Yellow paint/brush-stroke highlight behind "HUNGRY APE"
 *  - 🍌 banana replaces the "A" separator between the two words
 *  - "Fast Food" subtitle in smaller rounded text
 */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-0 group select-none" prefetch={false}>
      {/* Yellow brushstroke block wrapping the full wordmark */}
      <div className="relative flex items-baseline gap-0">
        {/* Paint splash background */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -inset-x-3 rounded-[40%_60%_55%_45%/50%_40%_60%_50%] bg-accent/90 -rotate-1 -skew-x-2 z-0"
          style={{ transform: 'rotate(-1.5deg) skewX(-2deg)' }}
        />

        {/* HUNGRY */}
        <span
          className="relative z-10 font-brand text-foreground tracking-wider"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', letterSpacing: '0.05em', lineHeight: 1 }}
        >
          HUNGRY
        </span>

        {/* Banana separator */}
        <span
          className="relative z-10 text-xl mx-0.5 group-hover:rotate-12 transition-transform duration-300"
          style={{ fontSize: 'clamp(1rem, 2vw, 1.4rem)', lineHeight: 1 }}
          aria-hidden="true"
        >
          🍌
        </span>

        {/* APE */}
        <span
          className="relative z-10 font-brand text-foreground tracking-wider"
          style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', letterSpacing: '0.05em', lineHeight: 1 }}
        >
          APE
        </span>
      </div>

      {/* Fast Food subtitle — small, below (hidden on very small screens) */}
      <span
        className="hidden sm:block ml-2 font-body font-semibold text-foreground/70 text-xs self-end mb-0.5 italic"
        style={{ fontSize: '0.65rem' }}
      >
        Fast Food App
      </span>
    </Link>
  );
}
