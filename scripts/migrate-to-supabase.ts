// scripts/migrate-to-supabase.ts
// Execute no console do navegador APÓS fazer login no app

import { supabase } from '../packages/supabase/client';
import { getAll } from '../packages/lib/dataStore';

async function migrateToSupabase() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Faça login primeiro!');

  const local = getAll();
  console.log('📦 Migrando dados locais para Supabase...', {
    firms: local.firms?.length || 0,
    accounts: local.accounts?.length || 0,
    payouts: local.payouts?.length || 0,
    trades: local.trades?.length || 0,
    strategies: local.strategies?.length || 0,
    livePositions: local.livePositions?.length || 0,
  });

  let total = 0;

  // 1. Firms
  for (const f of local.firms || []) {
    await supabase.from('firms').upsert({ ...f, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Firms: ${local.firms?.length || 0}`);

  // 2. Accounts
  for (const a of local.accounts || []) {
    await supabase.from('accounts').upsert({ ...a, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Accounts: ${local.accounts?.length || 0}`);

  // 3. Payouts
  for (const p of local.payouts || []) {
    await supabase.from('payouts').upsert({ ...p, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Payouts: ${local.payouts?.length || 0}`);

  // 4. Trades
  for (const t of local.trades || []) {
    await supabase.from('trades').upsert({ ...t, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Trades: ${local.trades?.length || 0}`);

  // 5. Strategies
  for (const s of local.strategies || []) {
    await supabase.from('strategies').upsert({ ...s, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Strategies: ${local.strategies?.length || 0}`);

  // 6. Live Positions
  for (const p of local.livePositions || []) {
    await supabase.from('live_positions').upsert({ ...p, user_id: user.id }, { onConflict: 'id' });
    total++;
  }
  console.log(`✅ Live Positions: ${local.livePositions?.length || 0}`);

  // 7. Settings
  const { data: { user: u } } = await supabase.auth.getUser();
  if (u) {
    await supabase.from('profiles').upsert({ 
      id: u.id, 
      settings: local.settings,
      updated_at: new Date().toISOString()
    });
    console.log('✅ Settings migrados');
  }

  console.log(`\n🎉 Migração concluída! Total de registros: ${total}`);
  console.log('Agora os dados estão sincronizados no Supabase e disponíveis em qualquer dispositivo.');
}

// Como usar:
// 1. Faça login no app (https://giantrades.netlify.app)
// 2. Abra o console do navegador (F12)
// 3. Cole e execute: import('./scripts/migrate-to-supabase.ts').then(m => m.migrateToSupabase())