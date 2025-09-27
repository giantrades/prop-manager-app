// packages/journal-state/src/workers/monteCarlo.worker.js
self.addEventListener('message', (ev) => {
  const { cmd, payload } = ev.data;
  if (cmd === 'run') {
    const { sims = 1000, days = 252, initial = 10000, sample = [], dailyTradesMean = 1 } = payload;
    // sample is array of Result_R values (empirical)
    const results = [];
    for (let s=0; s<sims; s++) {
      let equity = initial;
      for (let d=0; d<days; d++) {
        // number of trades this day (Poisson-like)
        const n = Math.max(1, Math.round(dailyTradesMean));
        for (let t=0; t<n; t++) {
          // bootstrap sample
          const r = sample.length ? sample[Math.floor(Math.random() * sample.length)] : (Math.random()*2 - 1);
          equity += r * payload.riskPerR * (payload.riskPerR || 1) *  (payload.riskPerR ? 1 : 1); // simplified: r is in R
        }
      }
      results.push(equity);
      if (s % 50 === 0) self.postMessage({ type: 'progress', value: Math.round((s / sims) * 100) });
    }
    self.postMessage({ type: 'done', results });
  }
});
