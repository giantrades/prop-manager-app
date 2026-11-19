// SCANNER — editor de regras com destaque de sintaxe (overlay + textarea transparente).
// Reutilizado pela regra principal e pela regra de fundamentos.
import React, { useRef } from 'react';
import { highlightRule } from '@apps/lib/db';

interface RuleEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  error?: string | null;
  extraNumericFields?: string[];
  helpId?: string;
  ariaLabel?: string;
}

export default function RuleEditor({
  value, onChange, placeholder, error = null, extraNumericFields, helpId, ariaLabel,
}: RuleEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const parts = highlightRule(value ?? '', { extraNumericFields });

  const syncScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  return (
    <div className="mk-rules">
      <div className="mk-editor">
        <pre ref={preRef} className="mk-editor-highlight" aria-hidden="true">
          {parts.map((p, idx) => (
            <span key={idx} className={`mk-tok-${p.kind}`}>{p.text}</span>
          ))}
          {'\n'}
        </pre>
        <textarea
          ref={taRef}
          className="mk-editor-input"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          aria-label={ariaLabel}
          aria-describedby={helpId}
          aria-invalid={!!error}
        />
      </div>
      {error && <div className="mk-rules-error" role="alert">{error}</div>}
    </div>
  );
}
