// STAGE 2 — DataService. ÚNICO escritor. A UI nunca toca IndexedDB/localStorage
// direto. Toda escrita passa por aqui (stamp updatedAt/deviceId/version + evento).
//
// Proibido escrever saldo direto (`currentFunding`/`balance`) fora daqui — equity é
// derivado pelo DataChainEngine, nunca escrito à mão.

import type { DbAdapter } from './adapter';
import { nowIso } from './dateUtils';
import { runDestructiveWrite } from './runDestructiveWrite';
import {
  EventBus,
  globalEvents,
  bindBroadcastChannel,
  getDefaultBroadcastChannel,
  postDatastoreChange,
  type BroadcastChannelLike,
} from './events';
import {
  STORE_NAMES,
  type DatastoreChangePayload,
  type StoreName,
  type SyncedRecord,
} from './types';
import {
  AccountsRepo,
  FirmCostsRepo,
  GoalsRepo,
  MetaRepo,
  PayoutsRepo,
  PositionsRepo,
  PropExtensionsRepo,
  SnapshotsNetworthRepo,
  TaxRecordsRepo,
  TradesRepo,
  TransactionsRepo,
  type WriteOpts,
} from './repositories';

export type ChangeSource = DatastoreChangePayload['source'];

export interface DataServiceOptions {
  adapter: DbAdapter;
  deviceId?: string;
  /** Emite eventos `datastore:change` (default true). Desligue em testes que só gravam. */
  emitChange?: boolean;
  /** EventBus local desta "aba". Default: bus global. Use instância própria em testes. */
  bus?: EventBus;
  /** Channel de BroadcastChannel (cross-tab). Default: cria um por módulo. */
  channel?: BroadcastChannelLike | null;
}

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const ENTITY_TYPE_BY_STORE: Partial<Record<StoreName, DatastoreChangePayload['entityType']>> = {
  accounts: 'account',
  transactions: 'transaction',
  trades: 'trade',
  payouts: 'payout',
  goals: 'goal',
  positions: 'position',
  meta: 'meta',
};

export class DataService {
  readonly adapter: DbAdapter;
  readonly deviceId: string;
  readonly emitChange: boolean;
  readonly bus: EventBus;
  readonly channel: BroadcastChannelLike | null;
  /** Disposer do listener do BroadcastChannel (chama em teardown). */
  readonly disposeBroadcast: () => void;

  readonly accounts: AccountsRepo;
  readonly propExtensions: PropExtensionsRepo;
  readonly transactions: TransactionsRepo;
  readonly positions: PositionsRepo;
  readonly trades: TradesRepo;
  readonly payouts: PayoutsRepo;
  readonly goals: GoalsRepo;
  readonly taxRecords: TaxRecordsRepo;
  readonly snapshotsNetworth: SnapshotsNetworthRepo;
  readonly firmCosts: FirmCostsRepo;
  readonly meta: MetaRepo;

  constructor(opts: DataServiceOptions) {
    this.adapter = opts.adapter;
    this.deviceId = opts.deviceId ?? generateDeviceId();
    this.emitChange = opts.emitChange ?? true;
    this.bus = opts.bus ?? globalEvents;
    // Default: usa o singleton do módulo (BroadcastChannel único). Testes injetam channel.
    this.channel = opts.channel === undefined ? getDefaultBroadcastChannel() : opts.channel;
    this.disposeBroadcast = bindBroadcastChannel(this.bus, this.channel);

    this.accounts = new AccountsRepo(this);
    this.propExtensions = new PropExtensionsRepo(this);
    this.transactions = new TransactionsRepo(this);
    this.positions = new PositionsRepo(this);
    this.trades = new TradesRepo(this);
    this.payouts = new PayoutsRepo(this);
    this.goals = new GoalsRepo(this);
    this.taxRecords = new TaxRecordsRepo(this);
    this.snapshotsNetworth = new SnapshotsNetworthRepo(this);
    this.firmCosts = new FirmCostsRepo(this);
    this.meta = new MetaRepo(this);
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  list<T>(store: StoreName): Promise<T[]> {
    return this.adapter.getAll<T>(store);
  }

  get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return this.adapter.get<T>(store, id);
  }

  queryByIndex<T>(
    store: StoreName,
    indexName: string,
    query?: IDBKeyRange | string | number | null,
  ): Promise<T[]> {
    return this.adapter.getAllByIndex<T>(store, indexName, query);
  }

  async count(store: StoreName): Promise<number> {
    return this.adapter.count(store);
  }

  // -------------------------------------------------------------------------
  // Escrita (único writer)
  // -------------------------------------------------------------------------

  /** Chave primária do registro conforme o store (prop_extensions usa accountId). */
  private keyOf(store: StoreName, record: SyncedRecord): string {
    if (store === 'prop_extensions') {
      return (record as unknown as { accountId: string }).accountId;
    }
    return record.id;
  }

  private async stamp<T extends SyncedRecord>(store: StoreName, record: T): Promise<T> {
    const existing = await this.adapter.get<T>(store, this.keyOf(store, record));
    return {
      ...record,
      updatedAt: nowIso(),
      deviceId: this.deviceId,
      version: (existing?.version ?? 0) + 1,
    } as T;
  }

  async put<T extends SyncedRecord>(
    store: StoreName,
    record: T,
    opts?: WriteOpts,
  ): Promise<T> {
    const stamped = await this.stamp(store, record);
    await this.adapter.put(store, stamped);
    if (this.emitChange && opts?.emitChange !== false) {
      postDatastoreChange(
        this.bus,
        {
          timestamp: Date.now(),
          source: opts?.source ?? 'local',
          entityType: ENTITY_TYPE_BY_STORE[store],
          entityIds: [record.id],
        },
        this.channel,
      );
    }
    return stamped;
  }

  async bulkPut<T extends SyncedRecord>(
    store: StoreName,
    records: T[],
    opts?: WriteOpts,
  ): Promise<T[]> {
    if (records.length === 0) return [];
    const stamped = await Promise.all(records.map((r) => this.stamp(store, r)));
    await this.adapter.bulkPut(store, stamped);
    if (this.emitChange && opts?.emitChange !== false) {
      postDatastoreChange(
        this.bus,
        {
          timestamp: Date.now(),
          source: opts?.source ?? 'local',
          entityType: ENTITY_TYPE_BY_STORE[store],
          entityIds: stamped.map((r) => r.id),
        },
        this.channel,
      );
    }
    return stamped;
  }

  async remove(store: StoreName, id: string, opts?: WriteOpts): Promise<void> {
    await this.adapter.delete(store, id);
    if (this.emitChange && opts?.emitChange !== false) {
      postDatastoreChange(
        this.bus,
        {
          timestamp: Date.now(),
          source: opts?.source ?? 'local',
          entityType: ENTITY_TYPE_BY_STORE[store],
          entityIds: [id],
        },
        this.channel,
      );
    }
  }

  /**
   * Limpa uma store COM backup (P0: nunca `clear()` sem runDestructiveWrite).
   * Se falhar, restaura o snapshot e re-lança.
   */
  async clearStore(store: StoreName): Promise<void> {
    const result = await runDestructiveWrite(this.adapter, async (w) => {
      await w.clear(store);
    });
    if (result.restored) throw result.error;
  }

  /** Expõe os nomes de store válidos (evita importar STORE_NAMES na UI). */
  static storeNames(): StoreName[] {
    return [...STORE_NAMES];
  }
}
