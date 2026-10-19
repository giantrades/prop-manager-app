// Fase 2 — OCR de foto/print, 100% no dispositivo. `tesseract.js` é carregado sob
// demanda (dynamic import) e roda em worker. NÃO é exportado pelo barrel: só a UI de
// import faz `import('@apps/lib/db/ocr')`.
//
// O texto reconhecido passa por `ocrText.ts` (limpeza) e pelo MESMO parser
// (`bankStatement.ts`). OCR é best-effort: sempre com revisão do usuário.

export interface OcrProgress { status: string; progress: number; }

/** Pré-processa a imagem (escala p/ ~1600px, cinza + contraste) — melhora o OCR. */
async function preprocessImage(file: File): Promise<string | File> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('imagem inválida'));
      el.src = url;
    });
    const maxW = 1600;
    const scale = Math.min(1, maxW / Math.max(1, img.width));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return file; }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    // Cinza + contraste simples (deixa o texto mais nítido para o OCR).
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const c = g < 128 ? g * 0.7 : 255 - (255 - g) * 0.7; // estica contraste
      px[i] = px[i + 1] = px[i + 2] = c;
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return file;
  }
}

/**
 * Reconhece o texto de uma imagem e devolve as LINHAS. `onProgress` alimenta a UI.
 * Idioma padrão: português (`por`). Na 1ª vez baixa o idioma (cache do navegador/SW).
 */
export async function ocrImageToLines(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<string[]> {
  const prepared = await preprocessImage(file);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tesseract: any = await import('tesseract.js');
  const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
  const worker = await createWorker('por', 1, {
    logger: (m: { status?: string; progress?: number }) => onProgress?.({ status: m.status ?? '', progress: Number(m.progress) || 0 }),
  });
  try {
    const { data } = await worker.recognize(prepared);
    return String(data?.text ?? '')
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
  } finally {
    try { await worker.terminate(); } catch { /* noop */ }
  }
}
