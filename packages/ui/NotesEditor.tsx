// A1 — NotesEditor: rich-text (BlockNote) com fallback para textarea.
// BlockNote entra via dynamic import (bundle pesado fora do primeiro paint).
// Salva markdown em `notes`. Qualquer falha (import, API, render) cai no textarea.

import React, { Component, useEffect, useRef, useState } from 'react';

interface BoundaryProps {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

class EditorErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children ?? null;
  }
}

function PlainFallback({ value, onChange, ariaLabel }) {
  return (
    <textarea
      className="tf-input tf-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="O que funcionou? O que errou? Emoção?"
      rows={4}
      aria-label={ariaLabel || 'Notas do trade'}
    />
  );
}

function LoadedEditor({ mods, initialMarkdown, onChange, ariaLabel }) {
  const { useCreateBlockNote, BlockNoteView } = mods;
  const editor = useCreateBlockNote();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialMarkdown && initialMarkdown.trim()) {
      editor
        .tryParseMarkdownToBlocks(initialMarkdown)
        .then((blocks) => {
          if (blocks && blocks.length > 0) editor.replaceBlocks(editor.document, blocks);
        })
        .catch(() => {
          /* mantém documento vazio */
        });
    }
  }, [editor, initialMarkdown]);

  return (
    <div aria-label={ariaLabel || 'Notas do trade (editor rico)'}>
      <BlockNoteView
        editor={editor}
        onChange={() => {
          try {
            const md = editor.blocksToMarkdownLossy(editor.document);
            onChangeRef.current?.(md);
          } catch {
            /* ignora keystroke com erro */
          }
        }}
      />
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} [props.value] markdown inicial
 * @param {(md:string)=>void} [props.onChange]
 * @param {string} [props.ariaLabel]
 */
export default function NotesEditor({ value = '', onChange, ariaLabel }) {
  const [mods, setMods] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await import('@blocknote/mantine/style.css');
        const [react, mantine] = await Promise.all([
          import('@blocknote/react'),
          import('@blocknote/mantine'),
        ]);
        if (!react.useCreateBlockNote || !mantine.BlockNoteView) throw new Error('api');
        if (alive) setMods({ useCreateBlockNote: react.useCreateBlockNote, BlockNoteView: mantine.BlockNoteView });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!mods || failed) {
    return <PlainFallback value={value} onChange={onChange} ariaLabel={ariaLabel} />;
  }
  return (
    <EditorErrorBoundary fallback={<PlainFallback value={value} onChange={onChange} ariaLabel={ariaLabel} />}>
      <LoadedEditor mods={mods} initialMarkdown={value} onChange={onChange} ariaLabel={ariaLabel} />
    </EditorErrorBoundary>
  );
}
