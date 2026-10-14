// Fase 1 — extração de TEXTO de um PDF, 100% no dispositivo (offline). O `pdfjs-dist`
// e o worker são carregados sob demanda (dynamic import + `?url`), então não pesam o
// bundle inicial. NÃO é exportado pelo barrel (`index.ts`) de propósito: só a UI de
// import faz `import('@apps/lib/db/pdfText')`.
//
// O parsing dos lançamentos NÃO vive aqui — fica em `bankStatement.ts` (puro/testável).

// Vite resolve `?url` para a URL do asset (o worker do pdfjs).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface PdfTextItem { str?: string; transform?: number[]; }

/** Extrai as LINHAS do PDF agrupando os fragmentos por posição vertical (Y). */
export async function extractPdfLines(source: File | ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
  const data = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items as PdfTextItem[]) {
      if (typeof raw.str !== 'string' || !raw.str || !raw.transform) continue;
      const y = Math.round(raw.transform[5]);
      const x = raw.transform[4];
      const arr = rows.get(y) ?? [];
      arr.push({ x, s: raw.str });
      rows.set(y, arr);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const line = (rows.get(y) ?? [])
        .sort((a, b) => a.x - b.x)
        .map((r) => r.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}

/** Detecta PDF pela extensão/MIME ou pela assinatura `%PDF` (sem confiar no MIME). */
export async function isPdfFile(file: File): Promise<boolean> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  } catch {
    return false;
  }
}
