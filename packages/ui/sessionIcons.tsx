// Ícones de marco (line icons) das sessões de mercado — SVG inline, sem dependência.
// Usam `currentColor`, então a cor vem do contexto (cor da sessão). 24x24, traço fino.
import React from 'react';

export interface SessionIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/** Paleta única das sessões (mesma ordem em todo o app). */
export const SESSION_COLORS = ['#7c5cff', '#3498db', '#2ecc71', '#f1c40f', '#e74c3c'];

function base(size: number, className: string | undefined, style: React.CSSProperties | undefined) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    'aria-hidden': true as const,
    focusable: false as const,
  };
}

/** Sydney — Opera House (velas). */
export function SydneyIcon({ size = 14, className, style }: SessionIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3 20h18" />
      <path d="M4.5 20c0-3.6 2.2-6.4 5.5-7.5" />
      <path d="M9.5 20c0-4.6 2.7-8.7 6.5-10" />
      <path d="M14.5 20c0-5.4 1.9-9.1 4.7-10" />
      <path d="M6.5 12.6c1.3-.8 2.7-1.2 3.8-1.2" />
    </svg>
  );
}

/** Tokyo/Ásia — portal torii. */
export function TokyoIcon({ size = 14, className, style }: SessionIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3 5.2c3.2-1 14.8-1 18 0" />
      <path d="M5 9h14" />
      <path d="M7 9v12M17 9v12" />
      <path d="M12 5.2V2.8" />
    </svg>
  );
}

/** London — Big Ben (torre com relógio). */
export function LondonIcon({ size = 14, className, style }: SessionIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="12" cy="6.6" r="2.4" />
      <path d="M9 21V9.4h6V21" />
      <path d="M8.2 5.3 12 2l3.8 3.3" />
      <path d="M7 21h10" />
      <path d="M12 6.6v1.5M12 6.6h1.3" />
    </svg>
  );
}

/** New York — Estátua da Liberdade (coroa + tocha). */
export function NewYorkIcon({ size = 14, className, style }: SessionIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="10.5" cy="5.2" r="1.4" />
      <path d="M9.2 4.2 8.6 3M10.5 3.6V2.2M11.8 4.2l.6-1.2" />
      <path d="M13.3 6.6 15.8 9.4" />
      <path d="M15.8 9.4 17 6" />
      <path d="M17 5.6V4.2" />
      <path d="M9.2 6.6c-1.1.9-1.7 2.1-1.7 3.8V21M12.6 6.6c.6.5 1 1.2 1.2 2.1" />
      <path d="M7.6 21h6.4" />
    </svg>
  );
}

/** Fallback — relógio (sessão custom sem marco conhecido). */
export function GenericSessionIcon({ size = 14, className, style }: SessionIconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

type IconComp = React.ComponentType<SessionIconProps>;

/** Escolhe o ícone pelo id/nome da sessão (tolerante a ids legados). */
export function sessionIconFor(id: string): IconComp {
  const k = String(id ?? '').toLowerCase();
  if (k.includes('sydney')) return SydneyIcon;
  if (k.includes('tokyo') || k.includes('asian') || k.includes('ásia')) return TokyoIcon;
  if (k.includes('london') || k.includes('londres')) return LondonIcon;
  if (k.includes('newyork') || k.includes('new york') || k.includes('nova york') || k === 'ny') return NewYorkIcon;
  return GenericSessionIcon;
}
