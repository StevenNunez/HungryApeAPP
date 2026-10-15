import { useId } from 'react';

/**
 * El signo de Teo Labs: la Θ.
 *
 * Elegido el 10-10-2026. Un circulo atravesado por una barra es la Θ (theta),
 * inicial de θεός (theos): lo divino, el mundo. Adentro, la barra y el
 * meridiano forman la T de Teo, y el circulo es el mundo. La Θ pequena y verde
 * que orbita es el laboratorio (Labs). Hasta el 10-10-2026 era un punto; el
 * usuario quiso que ese punto tambien fuera una Θ. En el favicon (src/app/
 * icon.svg) sigue siendo un punto: a 16 px el anillo no se lee.
 *
 * Colores de la paleta Cielo de Elqui: el mundo va de cobalto (#2F4BFF) a
 * nebulosa (#8A5CFF) y la Θ pequena es verde (#22C55E). Los archivos maestros
 * (SVG, PNG, version en un color) estan en la carpeta "Marca Teo Labs".
 *
 * `useId` porque el signo aparece varias veces en la misma pagina (header,
 * footer) y dos <linearGradient> con el mismo id se pisan entre si.
 */
export default function BrandMark({
  className,
  title = 'Teo Labs',
  mono,
}: {
  className?: string;
  /** Texto para lectores de pantalla. Vacio = decorativo (cuando el nombre ya esta al lado). */
  title?: string;
  /** Un solo color para todo el signo (por ejemplo `currentColor`). */
  mono?: string;
}) {
  const id = useId().replace(/:/g, '');
  const paint = mono ?? `url(#${id})`;
  return (
    <svg
      viewBox="2.16 4.71 93.13 93.13"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {!mono && (
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="10" y1="16" x2="84" y2="90">
            <stop offset="0" stopColor="#2F4BFF" />
            <stop offset="1" stopColor="#8A5CFF" />
          </linearGradient>
        </defs>
      )}
      <g fill="none" stroke={paint} strokeWidth="6.5">
        <circle cx="46" cy="54" r="35" />
        <path d="M12.46 44 H79.54 M46 44 V89" />
      </g>
      <g fill="none" stroke={mono ?? '#22C55E'} strokeWidth="3">
        <circle cx="81" cy="19" r="7.2" />
        <path d="M73.8 19 H88.2" />
      </g>
    </svg>
  );
}
