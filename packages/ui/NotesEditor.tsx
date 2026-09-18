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

interface PlainFallbackProps {
  value?: string;
  onChange?: (md: string) => void;
  ariaLabel?: string;
}

function PlainFallback({ value, onChange, ariaLabel }: PlainFallbackProps) {
  return (
    <textarea
      className="tf-input tf-textarea"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder="O que funcionou? O que errou? Emoção?"
      rows={4}
      aria-label={ariaLabel || 'Notas do trade'}
    />
  );
}

interface BlockNoteMods {
  useCreateBlockNote: typeof import('@blocknote/react')['useCreateBlockNote'];
  BlockNoteView: typeof import('@blocknote/mantine')['BlockNoteView'];
}

interface LoadedEditorProps {
  mods: BlockNoteMods;
  initialMarkdown?: string;
  onChange?: (md: string) => void;
  ariaLabel?: string;
}

function LoadedEditor({ mods, initialMarkdown, onChange, ariaLabel }: LoadedEditorProps) {
  const { useCreateBlockNote, BlockNoteView } = mods;
  const editor = useCreateBlockNote();
  const onChangeRef = useRef<((md: string) => void) | undefined>(onChange);
  onChangeRef.current = onChange;
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialMarkdown && initialMarkdown.trim()) {
      // O runtime assume API assíncrona; coerção só de tipos (sem efeito em runtime).
      const pending = editor.tryParseMarkdownToBlocks(initialMarkdown) as unknown as Promise<
        Parameters<typeof editor.replaceBlocks>[1]
      >;
      pending
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

interface NotesEditorProps {
  value?: string;
  onChange?: (md: string) => void;
  ariaLabel?: string;
}
/**
 * @param {object} props
 * @param {string} [props.value] markdown inicial
 * @param {(md:string)=>void} [props.onChange]
 * @param {string} [props.ariaLabel]
  */
export default function NotesEditor({ value = '', onChange, ariaLabel }: NotesEditorProps) {
  const [mods, setMods] = useState<BlockNoteMods | null>(null);
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
