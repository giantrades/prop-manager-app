// src/services/journalService.ts
// Responsible for local persistence and optional Google Drive sync.
// Uses the googleDrive helper that you already have at @apps/utils/googleDrive.js

import { Trade } from '../types/trade';
import { v4 as uuidv4 } from 'uuid';
import { downloadLatestJSON, uploadOrUpdateJSON } from '@apps/utils/googleDrive.js';
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';


/**
 * NOTE: This service is intentionally simple:
 * - keep data in-memory while editing
 * - persist/load to/from Google Drive (if available)
 * - export/import helpers
 */

const FILE_NAME = 'journal_v1.json';

export type JournalData = {
  trades: Trade[];
  strategies: any[]; // simplified for now
  assets?: any[];
  accounts?: any[];
  meta?: any;
};

let _store: JournalData = { trades: [], strategies: [], assets: [], accounts: [], meta: {} };

export async function loadJournalFromDrive(): Promise<JournalData | null> {
  try {
    const json = await downloadLatestJSON();
    if (!json) return null;
    if (typeof json === 'string') {
      _store = JSON.parse(json);
    } else {
      _store = json;
    }
    return _store;
  } catch (err) {
    console.warn('[journalService] could not load from Drive', err);
    return null;
  }
}

export async function saveJournalToDrive(): Promise<any> {
  try {
    const res = await uploadOrUpdateJSON(FILE_NAME, _store);
    return res;
  } catch (err) {
    console.warn('[journalService] could not save to Drive', err);
    throw err;
  }
}

export function getStore() {
  return _store;
}

export function setStore(next: JournalData) {
  _store = next;
}

export function listTrades() {
  return _store.trades || [];
}

export function listStrategies() {
  return _store.strategies || [];
}

export function addTrade(payload: Partial<Trade>) {
  const now = new Date().toISOString();
  const trade: Trade = {
    id: uuidv4(),
    date: payload.date || now.split('T')[0],
    entry_time: payload.entry_time,
    exit_time: payload.entry_time,
    asset: payload.asset || 'UNKNOWN',
    strategyId: payload.strategyId || null,
    marketCategory: payload.marketCategory || 'Futures',
    accounts: payload.accounts || [],
    direction: payload.direction || 'Long',
    tf_signal: payload.tf_signal || '1h',
    volume: payload.volume || 0,
    entry_price: payload.entry_price || 0,
    stop_loss_price: payload.stop_loss_price || 0,
    profit_target_price: payload.profit_target_price || 0,
    orders_activated: payload.orders_activated || 1,
    executions: payload.executions || [],
    risk_per_R: payload.risk_per_R || 0,
    commission: payload.commission || 0,
    fees: payload.fees || 0,
    swap: payload.swap || 0,
    slippage: payload.slippage || 0,
    tags: payload.tags || {},
    notes: payload.notes || '',
    result_gross: payload.result_gross || 0,
    result_net: payload.result_net || 0,
    result_R: payload.result_R || 0,
    entryVwap: payload.entryVwap || 0,
    exitVwap: payload.exitVwap || 0,
    createdAt: now,
    updatedAt: now
  };
  _store.trades.push(trade);
  return trade;
}

export function updateTrade(id: string, changes: Partial<Trade>) {
  const idx = (_store.trades || []).findIndex(t => t.id === id);
  if (idx === -1) return null;
  const updated = { ..._store.trades[idx], ...changes, updatedAt: new Date().toISOString() };
  _store.trades[idx] = updated;
  return updated;
}

export function deleteTrade(id: string) {
  _store.trades = (_store.trades || []).filter(t => t.id !== id);
}
