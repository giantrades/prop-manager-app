// d.ts: só tipagem, não código real
export function uploadFile(
  name: string,
  content: unknown
): Promise<{ id: string }>;

export function uploadOrUpdateJSON(
  name: string,
  content: unknown
): Promise<{ id: string }>;
