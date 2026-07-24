import { supabase } from '../supabase/client';
import { getTradeLedger } from '@apps/lib/dataStore';

const ALLOWED_COLUMNS: Record<string, string[]> = {
  firms: ['id', 'user_id', 'name', 'type', 'logo', 'color', 'created_at', 'date_created'],
  accounts: ['id', 'user_id', 'firm_id', 'name', 'type', 'status', 'initial_funding',
    'current_funding', 'profit_split', 'payout_frequency', 'platform_account_id',
    'platform_name', 'connection_id', 'connection_name', 'last_platform_sync',
    'created_at', 'currency', 'date_created'],
  payouts: ['id', 'user_id', 'account_id', 'account_ids', 'accounts', 'amount_solicited',
    'amount_received', 'fee', 'method', 'status', 'date_created', 'approved_date',
    'split_by_account', 'attachments', '_archived_accounts'],
  trades: ['id', 'user_id', 'account_id', 'entry_datetime', 'exit_datetime', 'asset',
    'direction', 'volume', 'entry_price', 'exit_price', 'result_net', 'result_gross',
    'fee', 'risk', 'notes', 'source', 'platform_trade_id', 'platform_name',
    'connection_name', 'position_id', 'is_live', 'created_at', 'internal_account_id', 'strategy_id'],
  live_positions: ['id', 'user_id', 'account_id', 'symbol', 'side', 'quantity',
    'entry_price', 'current_price', 'unrealized_pnl', 'entry_time',
    'platform_position_id', 'platform_name', 'connection_name',
    'open_price', 'open_time', 'gross_pnl', 'net_pnl', 'fee',
    'connection_id', 'platform_account_id'],
  strategies: ['id', 'user_id', 'name', 'description', 'rules', 'created_at'],
};

function pick(obj: any, allowed: string[]): any {
  const out: any = {};
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) {
      out[key] = obj[key];
    }
  }
  return out;
}

const TIMESTAMP_FIELDS = new Set([
  'entry_datetime', 'exit_datetime', 'date_created', 'created_at',
  'entry_time', 'open_time', 'approved_date', 'last_platform_sync',
]);

function toSnakeCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const val = toSnakeCase(value);
    if (TIMESTAMP_FIELDS.has(snakeKey) && (val === '' || val === null || val === undefined)) {
      out[snakeKey] = null;
    } else {
      out[snakeKey] = val;
    }
  }
  return out;
}

function prepare(table: string, rows: any[], userId: string): any[] {
  return rows.map((r: any) => {
    const snaked = toSnakeCase({ ...r, user_id: userId });
    return pick(snaked, ALLOWED_COLUMNS[table] || Object.keys(snaked));
  });
}

export async function pushChanges(localData: any, userId: string) {
  const errors: string[] = [];

  if (localData.firms?.length) {
    const { error } = await supabase.from('firms').upsert(
      prepare('firms', localData.firms, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`firms: ${error.message}`);
  }

  if (localData.accounts?.length) {
    const { error } = await supabase.from('accounts').upsert(
      prepare('accounts', localData.accounts, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`accounts: ${error.message}`);
  }

  if (localData.payouts?.length) {
    const { error } = await supabase.from('payouts').upsert(
      prepare('payouts', localData.payouts, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`payouts: ${error.message}`);
  }

  const validAccountIds = new Set((localData.accounts || []).map(a => a.id));

  if (localData.trades?.length) {
    const filtered = localData.trades.map((t: any) => ({
      ...t,
      accountId: validAccountIds.has(t.accountId) ? t.accountId : null,
    }));
    const { error } = await supabase.from('trades').upsert(
      prepare('trades', filtered, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`trades: ${error.message}`);
  }

  if (localData.strategies?.length) {
    const { error } = await supabase.from('strategies').upsert(
      prepare('strategies', localData.strategies, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`strategies: ${error.message}`);
  }

  if (localData.settings) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from('profiles').upsert({ 
        id: user.id, 
        settings: localData.settings,
        updated_at: new Date().toISOString()
      });
      if (error) errors.push(`settings: ${error.message}`);
    }
  }

  // Push local deletions to Supabase so other devices see them
  const ledger = await getTradeLedger();
  const deletedEntries = ledger.filter((e: any) => e.status === 'deleted' && e.platformTradeId);
  if (deletedEntries.length > 0) {
    const { data: existing } = await supabase
      .from('deleted_trades')
      .select('platform_trade_id')
      .eq('user_id', userId);
    const onServer = new Set((existing || []).map((d: any) => d.platform_trade_id));
    for (const entry of deletedEntries) {
      if (onServer.has(entry.platformTradeId)) continue;
      const { error } = await supabase.from('deleted_trades').upsert({
        user_id: userId,
        platform_trade_id: entry.platformTradeId,
        position_id: entry.positionId || null,
      }, { onConflict: 'platform_trade_id' });
      if (error) errors.push(`deleted_trades: ${error.message}`);
    }
  }

  // Push live positions so all devices see current positions
  if (localData.livePositions?.length) {
    const { error } = await supabase.from('live_positions').upsert(
      prepare('live_positions', localData.livePositions, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`live_positions: ${error.message}`);
  }

  if (errors.length > 0) {
    throw new Error(`Push failed: ${errors.join('; ')}`);
  }
}
