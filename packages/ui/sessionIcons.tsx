// Ícones de marco (line icons) das sessões de mercado — SVG inline, sem dependência.
// Usam `currentColor`, então a cor vem do contexto (cor da sessão). Grade 24x24.
// Cada ícone = "massa" translúcida (preenchimento a 16%) + traço: a massa segura a
// silhueta quando o ícone é pequeno (14px nas etiquetas do mapa) e o traço dá o detalhe.
import React from 'react';

export interface SessionIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/** Paleta única das sessões (mesma ordem em todo o app). */
export const SESSION_COLORS = ['#7c5cff', '#3498db', '#2ecc71', '#f1c40f', '#e74c3c'];

function Svg({
  size, className, style, title, children,
}: SessionIconProps & { size: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable={false}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Massa translúcida (sem traço). */
const T = { fill: 'currentColor', fillOpacity: 0.16, stroke: 'none' } as const;

/** Sydney — Opera House: conchas (velas) pontudas sobre a plataforma. */
export function SydneyIcon({ size = 14, className, style, title }: SessionIconProps) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      <path {...T} d="M2.6 20.5C3.4 13.6 6.6 8.6 11.4 5.2c.8 5.2.7 10.6-.4 15.3Z" />
      <path {...T} d="M9.6 20.5C9.9 12.4 12.6 6.4 17.4 2.6c1.5 5.7 1.7 11.7.6 17.9Z" />
      <path {...T} d="M16 20.5c.3-4.6 2.1-8.2 5.6-10.6.5 3.4.4 7-.2 10.6Z" />
      <path d="M2.6 20.5C3.4 13.6 6.6 8.6 11.4 5.2c.8 5.2.7 10.6-.4 15.3" />
      <path d="M9.6 20.5C9.9 12.4 12.6 6.4 17.4 2.6c1.5 5.7 1.7 11.7.6 17.9" />
      <path d="M16 20.5c.3-4.6 2.1-8.2 5.6-10.6.5 3.4.4 7-.2 10.6" />
      <path d="M1.8 20.5h20.4" />
    </Svg>
  );
}

/** Tokyo/Ásia — portal torii. */
export function TokyoIcon({ size = 14, className, style, title }: SessionIconProps) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      <path {...T} d="M2 5.2Q12 8.6 22 5.2L21.3 8.4H2.7Z" />
      <path d="M2 5.2Q12 8.6 22 5.2" />
      <path d="M3.6 8.6h16.8" />
      <path d="M5.8 12h12.4" />
      <path d="M7.3 8.6 6.9 21.5M16.7 8.6l.4 12.9" />
      <path d="M12 8.6V12" />
    </Svg>
  );
}

/** London — Big Ben (Elizabeth Tower): pináculo, relógio e fuste. */
export function LondonIcon({ size = 14, className, style, title }: SessionIconProps) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      <path {...T} d="M8.2 6.6h7.6v8.2H8.2Z" />
      <path d="M12 1.6 8.2 6.6h7.6Z" />
      <path d="M8.2 6.6v8.2h7.6V6.6" />
      <circle cx="12" cy="10.7" r="2.9" />
      <path d="M12 9.3v1.5l.9.6" strokeWidth={1.2} />
      <path d="M9.6 14.8v6.7M14.4 14.8v6.7" />
      <path d="M7.4 21.5h9.2" />
    </Svg>
  );
}

/** New York — Estátua da Liberdade: tocha, coroa, corpo e pedestal. */
export function NewYorkIcon({ size = 14, className, style, title }: SessionIconProps) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      <path {...T} d="M8.6 12.4h4.8l1.2 6.7H7.4Z" />
      <path d="M6.2 21.5h9.6l-1.2-2.4H7.4Z" />
      <path d="M8.6 12.4 7.4 19.1M13.4 12.4l1.2 6.7" />
      <path d="M8.6 12.4h4.8" />
      <circle cx="11" cy="9.6" r="1.5" />
      <path d="M9.2 8.2 7.9 7M11 7.9V6.1M12.8 8.2l1.3-1.2" />
      <path d="M13.4 12.4 17.6 6.6" />
      <path d="M16.6 5.9h2.2" />
      <path d="M17.7 5.9c-.6-1-.6-2.1 0-3.3.6 1.2.6 2.3 0 3.3Z" />
    </Svg>
  );
}


/** Fallback — relógio (sessão custom sem marco conhecido). */
export function GenericSessionIcon({ size = 14, className, style, title }: SessionIconProps) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      <circle {...T} cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

type IconComp = React.ComponentType<SessionIconProps>;

/** Escolhe o ícone pelo id/nome da sessão (tolerante a ids legados, acentos e separadores). */
export function sessionIconFor(id: string): IconComp {
  const k = String(id ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
  if (k.includes('sydney') || k.includes('sidney')) return SydneyIcon;
  if (k.includes('tokyo') || k.includes('toquio') || k.includes('asian') || k.includes('asia')) return TokyoIcon;
  if (k.includes('london') || k.includes('londres')) return LondonIcon;
  if (k.includes('newyork') || k.includes('novayork') || k === 'ny') return NewYorkIcon;
  return GenericSessionIcon;
}