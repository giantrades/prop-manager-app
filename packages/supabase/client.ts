import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// ============================================
// TYPES COMPARTILHADOS (main-app + trading-journal)
// ============================================

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type Firm = {
  id: string;
  user_id: string;
  name: string;
  type: 'Futures' | 'Forex' | 'Cripto' | 'Personal';
  logo: string | null;
  color: string;
  created_at: string;
};

export type Account = {
  id: string;
  user_id: string;
  firm_id: string | null;
  name: string;
  type: 'Futures' | 'Forex' | 'Personal' | 'Cripto';
  status: 'Live' | 'Funded' | 'Challenge' | 'Standby' | 'Demo';
  initial_funding: number;
  current_funding: number;
  profit_split: number;
  payout_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  platform_account_id: string | null;
  platform_name: string | null;
  connection_id: string | null;
  connection_name: string | null;
  last_platform_sync: string | null;
  created_at: string;
};

export type Payout = {
  id: string;
  user_id: string;
  account_id: string | null;
  account_ids: string[];
  accounts: any[];
  amount_solicited: number;
  amount_received: number;
  fee: number;
  method: 'Rise' | 'Wise' | 'Pix' | 'Paypal' | 'Cripto';
  status: 'Pending' | 'Completed' | 'Failed';
  date_created: string;
  approved_date: string | null;
  split_by_account: Record<string, any>;
  attachments: Record<string, any>;
  _archived_accounts: any[];
};

export type Trade = {
  id: string;
  user_id: string;
  account_id: string | null;
  entry_datetime: string;
  exit_datetime: string | null;
  asset: string;
  direction: 'Long' | 'Short';
  volume: number;
  entry_price: number;
  exit_price: number | null;
  result_net: number;
  result_gross: number;
  fee: number;
  risk: number | null;
  notes: string;
  source: 'manual' | 'quantower' | 'ctrader' | 'csv';
  platform_trade_id: string | null;
  platform_name: string | null;
  connection_name: string | null;
  position_id: string | null;
  is_live: boolean;
  created_at: string;
};

export type Strategy = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  rules: any[];
  created_at: string;
};

export type LivePosition = {
  id: string;
  user_id: string;
  account_id: string | null;
  symbol: string;
  side: 'Long' | 'Short';
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  entry_time: string;
  platform_position_id: string | null;
  platform_name: string | null;
  connection_name: string | null;
};

export type Settings = Record<string, any>;

export type AllData = {
  firms: Firm[];
  accounts: Account[];
  payouts: Payout[];
  trades: Trade[];
  strategies: Strategy[];
  livePositions: LivePosition[];
  settings: Settings;
};