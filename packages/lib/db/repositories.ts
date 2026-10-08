// STAGE 2 — Repositórios por entidade. Cada um encapsula o store correspondente e
// expõe operações tipadas. A UI NUNCA toca IndexedDB/localStorage direto — só via
// DataService (único writer) + estes repositórios.

import type { DataService } from './DataService';
import type {
  Account,
  Card,
  FirmCost,
  Goal,
  Meta,
  OptionChainQuote,
  OptionLeg,
  Payout,
  Position,
  PropExtension,
  SnapshotNetworth,
  StoreName,
  StoredOptionTemplate,
  SyncedRecord,
  TaxRecord,
  Trade,
  Transaction,
} from './types';

export interface WriteOpts {
  source?: 'local' | 'sync:pull' | 'sync:push' | 'restore' | 'quantower';
  emitChange?: boolean;
}

export class BaseRepository<T extends SyncedRecord> {
  constructor(
    protected readonly ds: DataService,
    protected readonly store: StoreName,
  ) {}

  list(): Promise<T[]> {
    return this.ds.list<T>(this.store);
  }

  get(id: string): Promise<T | undefined> {
    return this.ds.get<T>(this.store, id);
  }

  put(record: T, opts?: WriteOpts): Promise<T> {
    return this.ds.put<T>(this.store, record, opts);
  }

  bulkPut(records: T[], opts?: WriteOpts): Promise<T[]> {
    return this.ds.bulkPut<T>(this.store, records, opts);
  }

  remove(id: string, opts?: WriteOpts): Promise<void> {
    return this.ds.remove(this.store, id, opts);
  }

  queryByIndex(
    indexName: string,
    query?: IDBKeyRange | string | number | null,
  ): Promise<T[]> {
    return this.ds.queryByIndex<T>(this.store, indexName, query);
  }
}

export class AccountsRepo extends BaseRepository<Account> {
  constructor(ds: DataService) {
    super(ds, 'accounts');
  }
  byKind(kind: Account['kind']): Promise<Account[]> {
    return this.queryByIndex('kind', kind);
  }
  byPlatformAccountId(id: string): Promise<Account[]> {
    return this.queryByIndex('platformAccountId', id);
  }
}

// Fricção de tipos conhecida (Fase 1): PropExtension usa `accountId` como chave
// (keyPath), não `id` — o runtime está certo (`DataService.keyOf` trata o caso).
// @ts-expect-error PropExtension não tem `id`, mas o repositório só usa accountId
export class PropExtensionsRepo extends BaseRepository<PropExtension> {
  constructor(ds: DataService) {
    super(ds, 'prop_extensions');
  }
  byAccountId(accountId: string): Promise<PropExtension | undefined> {
    // keyPath é accountId, então get direto.
    return this.ds.get<PropExtension>('prop_extensions', accountId);
  }
  byPhase(phase: PropExtension['phase']): Promise<PropExtension[]> {
    return this.queryByIndex('phase', phase);
  }
}

export class TransactionsRepo extends BaseRepository<Transaction> {
  constructor(ds: DataService) {
    super(ds, 'transactions');
  }
  byAccountDate(accountId: string, date: string): Promise<Transaction[]> {
    return this.queryByIndex('account_date', [accountId, date] as unknown as string);
  }
  byFirmDate(firmId: string, date: string): Promise<Transaction[]> {
    return this.queryByIndex('firm_date', [firmId, date] as unknown as string);
  }
  byKindDate(kind: Transaction['kind'], date: string): Promise<Transaction[]> {
    return this.queryByIndex('kind_date', [kind, date] as unknown as string);
  }
}

export class PositionsRepo extends BaseRepository<Position> {
  constructor(ds: DataService) {
    super(ds, 'positions');
  }
  byAccountSymbol(accountId: string, symbol: string): Promise<Position[]> {
    return this.queryByIndex('account_symbol', [accountId, symbol] as unknown as string);
  }
}

export class TradesRepo extends BaseRepository<Trade> {
  constructor(ds: DataService) {
    super(ds, 'trades');
  }
  byAccountEntry(accountId: string, entryDatetime: string): Promise<Trade[]> {
    return this.queryByIndex('account_entry', [accountId, entryDatetime] as unknown as string);
  }
  byStrategyEntry(strategyId: string, entryDatetime: string): Promise<Trade[]> {
    return this.queryByIndex('strategy_entry', [strategyId, entryDatetime] as unknown as string);
  }
  byQuantowerId(quantowerId: string): Promise<Trade[]> {
    return this.queryByIndex('quantowerId', quantowerId);
  }
}

export class PayoutsRepo extends BaseRepository<Payout> {
  constructor(ds: DataService) {
    super(ds, 'payouts');
  }
}

export class GoalsRepo extends BaseRepository<Goal> {
  constructor(ds: DataService) {
    super(ds, 'goals');
  }
}

export class TaxRecordsRepo extends BaseRepository<TaxRecord> {
  constructor(ds: DataService) {
    super(ds, 'tax_records');
  }
}

export class SnapshotsNetworthRepo extends BaseRepository<SnapshotNetworth> {
  constructor(ds: DataService) {
    super(ds, 'snapshots_networth');
  }
}

export class FirmCostsRepo extends BaseRepository<FirmCost> {
  constructor(ds: DataService) {
    super(ds, 'firm_costs');
  }
}

export class CardsRepo extends BaseRepository<Card> {
  constructor(ds: DataService) {
    super(ds, 'cards');
  }
}

export class OptionLegsRepo extends BaseRepository<OptionLeg> {
  constructor(ds: DataService) {
    super(ds, 'option_legs');
  }
  byUnderlyingExpiry(underlying: string, expiry: string): Promise<OptionLeg[]> {
    return this.queryByIndex('underlying_expiry', [underlying, expiry] as unknown as string);
  }
  byGroup(groupId: string): Promise<OptionLeg[]> {
    return this.queryByIndex('groupId', groupId);
  }
  byQuantowerId(quantowerId: string): Promise<OptionLeg[]> {
    return this.queryByIndex('quantowerId', quantowerId);
  }
}

export class OptionTemplatesRepo extends BaseRepository<StoredOptionTemplate> {
  constructor(ds: DataService) {
    super(ds, 'option_templates');
  }
}

export class OptionChainRepo extends BaseRepository<OptionChainQuote> {
  constructor(ds: DataService) {
    super(ds, 'option_chain');
  }
  byUnderlyingExpiry(underlying: string, expiry: string): Promise<OptionChainQuote[]> {
    return this.queryByIndex('underlying_expiry', [underlying, expiry] as unknown as string);
  }
}

export class MetaRepo extends BaseRepository<Meta> {
  constructor(ds: DataService) {
    super(ds, 'meta');
  }
  async getKey(key: string): Promise<Meta | undefined> {
    const all = await this.list();
    return all.find((m) => m.key === key);
  }
  async setKey(key: string, value: unknown): Promise<Meta> {
    const existing = await this.getKey(key);
    return this.put({
      id: existing?.id ?? `meta:${key}`,
      key,
      value,
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
      deviceId: existing?.deviceId ?? '',
      version: existing?.version ?? 0,
    });
  }
}
