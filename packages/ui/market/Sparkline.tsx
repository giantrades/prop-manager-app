// MARKET — sparkline SVG puro (sem recharts: leve, cabe na tabela).
import React from 'react';
import { sparkPath } from './marketUi';

interface SparklineProps {
  series: Array<[number, number]>;
  width?: number;
  height?: number;
  changePct?: number | null;
  ariaLabel?: string;
}

export default function Sparkline({ series, width = 96, height = 26, changePct = null, ariaLabel }: SparklineProps) {
  const d = sparkPath(series, width, height);
  if (!d) return <span className="mk-flat" aria-hidden="true">—</span>;
  const up = (changePct ?? 0) >= 0;
  const stroke = up ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)';
  const gid = `mk-spark-${up ? 'u' : 'd'}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? 'sparkline'}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${gid})`} stroke="none" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
