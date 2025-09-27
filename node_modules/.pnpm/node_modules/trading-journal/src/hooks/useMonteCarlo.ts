// @apps/trading-journal/src/hooks/useMonteCarlo.ts
import { useEffect, useRef, useState } from 'react';
import type { MonteCarloConfig, MonteCarloSummary, MonteCarloHistoryItem } from '../types/monteCarlo';
import { saveHistory, listHistory, uploadHistoryToDrive } from '../services/monteCarloService';

type UseMonteCarloReturn = {
  running: boolean;
  progress: number;
  summary: MonteCarloSummary | null;
  sampleRuns: any[] | null;
  start: (config: MonteCarloConfig, empiricalR?: number[]) => Promise<void>;
  stop: () => void;
  history: MonteCarloHistoryItem[];
  refreshHistory: () => Promise<MonteCarloHistoryItem[]>;
  loadHistoryItem: (id: string) => Promise<MonteCarloHistoryItem | null>;
};

export function useMonteCarlo(): UseMonteCarloReturn {
  const workerRef = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<MonteCarloSummary | null>(null);
  const [sampleRuns, setSampleRuns] = useState<any[] | null>(null);
  const [history, setHistory] = useState<MonteCarloHistoryItem[]>([]);

  useEffect(() => {
    refreshHistory(); 
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  async function refreshHistory() {
    const items = await listHistory();
    setHistory(items.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)));
    return items;
  }

  function handleWorkerMessage(e: MessageEvent) {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'PROGRESS') {
      setProgress(msg.progress);
    } else if (msg.type === 'RESULT') {
      setSummary(msg.summary);
      setSampleRuns(msg.sampleRuns || []);
      setRunning(false);
      setProgress(100);
      // Save to indexeddb
      (async () => {
        try {
          const saved = await saveHistory(currentConfigRef.current!, msg.summary);
          // optionally upload to Drive
          try {
            const fileId = await uploadHistoryToDrive(saved);
            if (fileId) {
              // attach file id locally
              saved.driveFileId = fileId;
            }
          } catch (err) {}
          await refreshHistory();
        } catch (err) {
          console.warn('saveHistory error', err);
        }
      })();
    } else if (msg.type === 'ERROR') {
      console.error('Worker error', msg.message);
      setRunning(false);
    }
  }

  const currentConfigRef = useRef<MonteCarloConfig | null>(null);

  async function start(config: MonteCarloConfig, empiricalR?: number[]) {
    if (running) stop();
    setRunning(true);
    setProgress(0);
    setSummary(null);
    setSampleRuns(null);
    currentConfigRef.current = config;
    // create worker. bundlers may need "new Worker(new URL(..., import.meta.url))"
    // try both strategies
    try {
      let w: Worker;
      try {
        // modern bundlers
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        w = new Worker(new URL('../workers/monteCarloWorker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        // fallback if above fails: try importing the JS worker built output path (adjust if necessary)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        w = new Worker('/workers/monteCarloWorker.js');
      }
      workerRef.current = w;
      w.onmessage = handleWorkerMessage;
      w.postMessage({ type: 'START', config, empiricalR });
    } catch (err) {
      console.error('failed to start worker', err);
      setRunning(false);
    }
  }

  function stop() {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'TERMINATE' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setRunning(false);
    setProgress(0);
  }

  async function loadHistoryItem(id: string) {
    // lazy load via service
    const items = await listHistory();
    const it = items.find((i) => i.id === id) || null;
    return it;
  }

  return {
    running,
    progress,
    summary,
    sampleRuns,
    start,
    stop,
    history,
    refreshHistory,
    loadHistoryItem,
  };
}
