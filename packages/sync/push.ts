import { supabase } from '../supabase/client';
import { getTradeLedger, getAll, save } from '@apps/lib/dataStore';

const ALLOWED_COLUMNS: Record<string, string[]> = {
  firms: ['id', 'user_id', 'name', 'type', 'logo', 'color', 'created_at', 'date_created'],
  accounts: ['id', 'user_id', 'firm_id', 'name', 'type', 'status', 'initial_funding',
    'current_funding', 'profit_split', 'payout_frequency', 'platform_account_id',
    'platform_name', 'connection_id', 'connection_name', 'last_platform_sync',
    'created_at', 'currency', 'date_created'],
  payouts: ['id', 'user_id', 'account_id', 'account_ids', 'accounts', 'amount_solicited',
    'amount_received', 'fee', 'method', 'status', 'date_created', 'approved_date',
    'split_by_account', 'attachments', '_archived_accounts', 'firm_id'],
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
  goals: ['id', 'user_id', 'title', 'description', 'type', 'target_value', 'current_value',
    'period', 'start_date', 'end_date', 'min_days', 'completed', 'created_at', 'updated_at',
    'completed_at', 'archived'],
  tags: ['id', 'user_id', 'name', 'color', 'created_at'],
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

  const deletedFirmIds = (localData as any)._deletedFirmIds;
  if (deletedFirmIds?.length) {
    const { error: delErr } = await supabase
      .from('firms')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedFirmIds);
    if (delErr) {
      errors.push(`delete_firms: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedFirmIds = (fresh._deletedFirmIds || []).filter(
        (id: string) => !deletedFirmIds.includes(id)
      );
      save(fresh);
    }
  }

  if (localData.accounts?.length) {
    const statusChanges = localData.accounts.filter((a: any) => a.status).map((a: any) => `${a.name}:${a.status}`);
    console.log('[push] accounts status:', statusChanges);
    const { error } = await supabase.from('accounts').upsert(
      prepare('accounts', localData.accounts, userId),
      { onConflict: 'id' }
    );
    if (error) {
      console.error('[push] accounts ERROR:', error.message);
      errors.push(`accounts: ${error.message}`);
    } else {
      console.log('[push] accounts OK');
    }
  }

  // Propagate account deletions to Supabase so they don't reappear on pull
  const deletedAccountIds = (localData as any)._deletedAccountIds;
  if (deletedAccountIds?.length) {
    const { error: delErr } = await supabase
      .from('accounts')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedAccountIds);
    if (delErr) {
      errors.push(`delete_accounts: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedAccountIds = (fresh._deletedAccountIds || []).filter(
        (id: string) => !deletedAccountIds.includes(id)
      );
      save(fresh);
    }
  }

  if (localData.payouts?.length) {
    const { error } = await supabase.from('payouts').upsert(
      prepare('payouts', localData.payouts, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`payouts: ${error.message}`);
  }

  const deletedPayoutIds = (localData as any)._deletedPayoutIds;
  if (deletedPayoutIds?.length) {
    const { error: delErr } = await supabase
      .from('payouts')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedPayoutIds);
    if (delErr) {
      errors.push(`delete_payouts: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedPayoutIds = (fresh._deletedPayoutIds || []).filter(
        (id: string) => !deletedPayoutIds.includes(id)
      );
      save(fresh);
    }
  }

  const validAccountIds = new Set((localData.accounts || []).map(a => a.id));

  if (localData.trades?.length) {
    const filtered = localData.trades
      .filter((t: any) => {
        const netPnl = Number(t.result_net ?? t.resultNet ?? 0);
        const exitDt = t.exit_datetime || t.exitDatetime;
        const entryDt = t.entry_datetime || t.entryDatetime;
        const exitPr = t.exit_price ?? t.exitPrice;
        const isEntryFill = netPnl === 0 &&
          (!exitDt || String(exitDt).startsWith('0001') || exitDt === entryDt || !exitPr);
        return !isEntryFill;
      })
      .map((t: any) => ({
        ...t,
        accountId: validAccountIds.has(t.accountId) ? t.accountId : null,
      }));

    // Dedup by positionId/platformTradeId: keep only 1 per platform trade
    const seen = new Map();
    for (const t of filtered) {
      const key = t.positionId || t.platformTradeId || t.id;
      if (!seen.has(key) || new Date(t.exit_datetime || t.entry_datetime) > new Date(seen.get(key).exit_datetime || seen.get(key).entry_datetime)) {
        seen.set(key, t);
      }
    }
    const deduped = [...seen.values()];

    if (filtered.length < localData.trades.length || deduped.length < filtered.length) {
      const entryFillCount = localData.trades.length - filtered.length;
      const dedupCount = filtered.length - deduped.length;
      console.log(`[Push] Entry fills: ${entryFillCount}, Deduped: ${dedupCount}, Pushing: ${deduped.length} trades`);
    }

    // Clean up stale Supabase rows with same platformTradeId that are NOT being pushed
    const dedupedIds = new Set(deduped.map((t: any) => t.id));
    const platformIds = [...new Set(deduped.filter((t: any) => t.platformTradeId).map((t: any) => t.platformTradeId))];
    for (const ptId of platformIds) {
      const { data: stale } = await supabase.from('trades').select('id').eq('user_id', userId).eq('platform_trade_id', ptId);
      if (stale) {
        const toDelete = stale.filter((r: any) => !dedupedIds.has(r.id)).map((r: any) => r.id);
        if (toDelete.length) {
          await supabase.from('trades').delete().in('id', toDelete);
        }
      }
    }

    const { error } = await supabase.from('trades').upsert(
      prepare('trades', deduped, userId),
      { onConflict: 'id' }
    );
    if (filtered.length < localData.trades.length) {
      console.log(`[Push] Filtered out ${localData.trades.length - filtered.length} entry fills from push`);
    }
    if (error) errors.push(`trades: ${error.message}`);
  }

  if (localData.strategies?.length) {
    const { error } = await supabase.from('strategies').upsert(
      prepare('strategies', localData.strategies, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`strategies: ${error.message}`);
  }

  const deletedStrategyIds = (localData as any)._deletedStrategyIds;
  if (deletedStrategyIds?.length) {
    const { error: delErr } = await supabase
      .from('strategies')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedStrategyIds);
    if (delErr) {
      errors.push(`delete_strategies: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedStrategyIds = (fresh._deletedStrategyIds || []).filter(
        (id: string) => !deletedStrategyIds.includes(id)
      );
      save(fresh);
    }
  }

  if (localData.goals?.length) {
    const { error } = await supabase.from('goals').upsert(
      prepare('goals', localData.goals, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`goals: ${error.message}`);
  }

  const deletedGoalIds = (localData as any)._deletedGoalIds;
  if (deletedGoalIds?.length) {
    const { error: delErr } = await supabase
      .from('goals')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedGoalIds);
    if (delErr) {
      errors.push(`delete_goals: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedGoalIds = (fresh._deletedGoalIds || []).filter(
        (id: string) => !deletedGoalIds.includes(id)
      );
      save(fresh);
    }
  }

  if (localData.tags?.length) {
    const { error } = await supabase.from('tags').upsert(
      prepare('tags', localData.tags, userId),
      { onConflict: 'id' }
    );
    if (error) errors.push(`tags: ${error.message}`);
  }

  const deletedTagIds = (localData as any)._deletedTagIds;
  if (deletedTagIds?.length) {
    const { error: delErr } = await supabase
      .from('tags')
      .delete()
      .eq('user_id', userId)
      .in('id', deletedTagIds);
    if (delErr) {
      errors.push(`delete_tags: ${delErr.message}`);
    } else {
      const fresh = getAll();
      fresh._deletedTagIds = (fresh._deletedTagIds || []).filter(
        (id: string) => !deletedTagIds.includes(id)
      );
      save(fresh);
    }
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
      // Garante que o registro existe no deleted_trades (para outros devices)
      if (!onServer.has(entry.platformTradeId)) {
        const { error } = await supabase.from('deleted_trades').upsert({
          user_id: userId,
          platform_trade_id: entry.platformTradeId,
          position_id: entry.positionId || null,
        }, { onConflict: 'platform_trade_id' });
        if (error) errors.push(`deleted_trades: ${error.message}`);
      }
      // Também deleta da tabela trades por platform_trade_id (caso o delete por id tenha falhado)
      const { error: delErr } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', userId)
        .eq('platform_trade_id', entry.platformTradeId);
      if (delErr && delErr.code !== 'PGRST116') errors.push(`delete ${entry.platformTradeId}: ${delErr.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Push failed: ${errors.join('; ')}`);
  }
}
