export type ConflictStrategy = 'server' | 'local' | 'merge';

export function resolveConflict(
  local: any, 
  remote: any, 
  strategy: ConflictStrategy = 'server'
): any {
  if (strategy === 'server') return remote;
  if (strategy === 'local') return local;
  
  // Merge: newer timestamp wins per field
  const merged = { ...remote };
  for (const key of Object.keys(local)) {
    const localVal = local[key];
    const remoteVal = remote[key];
    const localTime = local.updated_at || local.created_at;
    const remoteTime = remote.updated_at || remote.created_at;
    
    if (localTime && remoteTime && new Date(localTime) > new Date(remoteTime)) {
      merged[key] = localVal;
    }
  }
  return { ...merged, updated_at: new Date().toISOString() };
}