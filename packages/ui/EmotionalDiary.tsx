// STAGE 12 — EmotionalDiary. Registro do dia (sono/humor/FOMO/nota) + tabela
// dia × R cruzando com os trades fechados. COMPOSIÇÃO: recebe entry + save + rows.

import React, { useState } from 'react';

interface DiaryEntry {
  sleep: number;
  mood: number;
  fomo: boolean;
  note?: string;
}

interface DiaryRow {
  date: string;
  sleep: number | null;
  mood: number | null;
  fomo: boolean | null;
  r: number;
}

interface EmotionalDiaryProps {
  entry?: DiaryEntry | null;
  rows?: DiaryRow[];
  onSave?: (entry: DiaryEntry) => void;
  loading?: boolean;
}

function fmtR(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}R`;
}

const SCALE: number[] = [1, 2, 3, 4, 5];

/**
 * @param {object} props
 * @param {{sleep:number;mood:number;fomo:boolean;note?:string}|null} [props.entry]
 * @param {Array<{date:string;sleep:number|null;mood:number|null;fomo:boolean|null;r:number}>} [props.rows]
 * @param {(entry:{sleep:number;mood:number;fomo:boolean;note?:string})=>void} [props.onSave]
 * @param {boolean} [props.loading]
 */
export default function EmotionalDiary({ entry = null, rows = [], onSave, loading = false }: EmotionalDiaryProps) {
  const [sleep, setSleep] = useState(entry?.sleep ?? 3);
  const [mood, setMood] = useState(entry?.mood ?? 3);
  const [fomo, setFomo] = useState(entry?.fomo ?? false);
  const [note, setNote] = useState(entry?.note ?? '');
  const [saved, setSaved] = useState(false);

  if (loading) {
    return (
      <div className="ed-root ed-loading" role="status" aria-live="polite">
        <div className="ed-skeleton" /><div className="ed-skeleton" />
        <span className="ed-screen-reader">Carregando diário…</span>
      </div>
    );
  }

  return (
    <div className="ed-root">
      <div className="ed-form">
        <div className="ed-form-title">Como você está hoje?</div>
        <div className="ed-scales">
          <div className="ed-scale">
            <span className="ed-label">Sono 😴</span>
            <div className="ed-opts" role="radiogroup" aria-label="Sono de 1 a 5">
              {SCALE.map((v) => (
                <button key={v} type="button" aria-pressed={sleep === v} className={`ed-opt${sleep === v ? ' active' : ''}`} onClick={() => setSleep(v)}>{v}</button>
              ))}
            </div>
          </div>
          <div className="ed-scale">
            <span className="ed-label">Humor 🙂</span>
            <div className="ed-opts" role="radiogroup" aria-label="Humor de 1 a 5">
              {SCALE.map((v) => (
                <button key={v} type="button" aria-pressed={mood === v} className={`ed-opt${mood === v ? ' active' : ''}`} onClick={() => setMood(v)}>{v}</button>
              ))}
            </div>
          </div>
          <label className="ed-fomo">
            <input type="checkbox" checked={fomo} onChange={(e) => setFomo(e.target.checked)} />
            <span>Operei com FOMO hoje</span>
          </label>
        </div>
        <input
          className="ed-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota do dia (opcional, ex.: operei news)"
          maxLength={500}
          aria-label="Nota do dia"
        />
        <button
          className="ed-btn ed-btn-primary"
          onClick={() => { onSave && onSave({ sleep, mood, fomo, note }); setSaved(true); setTimeout(() => setSaved(false), 2500); }}
        >
          Salvar dia
        </button>
        {saved && <div className="ed-ok" role="status">Salvo.</div>}
      </div>

      {rows.length > 0 && (
        <div className="ed-table-wrap">
          <div className="ed-table-title">Dia × R (correlação)</div>
          <div className="ed-table">
            <div className="ed-tr ed-th"><span>Dia</span><span>Sono</span><span>Humor</span><span>FOMO</span><span>R</span></div>
            {rows.slice(0, 14).map((r) => (
              <div key={r.date} className="ed-tr">
                <span>{r.date.slice(5)}</span>
                <span>{r.sleep ?? '—'}</span>
                <span>{r.mood ?? '—'}</span>
                <span>{r.fomo == null ? '—' : r.fomo ? '😬' : '✅'}</span>
                <span style={{ color: r.r >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{fmtR(r.r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ED_CSS = `
.ed-root { display: flex; flex-direction: column; gap: 14px; }
.ed-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ed-loading { gap: 8px; }
.ed-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ed-pulse 1.4s ease-in-out infinite; }
.ed-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.ed-form-title { font-size: 14px; font-weight: 800; }
.ed-scales { display: flex; flex-direction: column; gap: 10px; }
.ed-scale { display: flex; align-items: center; gap: 10px; }
.ed-label { font-size: 12px; color: var(--muted, #a1a7b3); min-width: 70px; }
.ed-opts { display: flex; gap: 6px; }
.ed-opt { width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 14px; cursor: pointer; }
.ed-opt.active { background: rgba(124,92,255,0.2); border-color: var(--brand, #7c5cff); font-weight: 800; }
.ed-fomo { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.ed-fomo input { width: 18px; height: 18px; accent-color: var(--red, #e74c3c); }
.ed-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.ed-btn { padding: 10px 18px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 42px; align-self: flex-start; }
.ed-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.ed-ok { font-size: 12px; color: var(--green, #2ecc71); }
.ed-table-wrap { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.ed-table-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.ed-tr { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap: 8px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-variant-numeric: tabular-nums; }
.ed-th { color: var(--muted, #a1a7b3); text-transform: uppercase; font-size: 10px; letter-spacing: 0.4px; }
@keyframes ed-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('emd-styles')) {
  const style = document.createElement('style');
  style.id = 'emd-styles';
  style.textContent = ED_CSS;
  document.head.appendChild(style);
}
