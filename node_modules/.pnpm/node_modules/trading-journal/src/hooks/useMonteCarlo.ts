// @apps/trading-journal/src/hooks/useMonteCarlo.ts

import { useState, useCallback, useRef, useEffect } from 'react';
import type { 
  MonteCarloRun, 
  MonteCarloSummary, 
  MonteCarloConfig, 
  MonteCarloHistoryItem 
} from '../types/monteCarlo'; 

import { saveHistory } from '../services/monteCarloService'; 

// 💥 CORREÇÃO 1: Use esta sintaxe para importar o construtor do Web Worker.
// Isso resolve o erro 'Module has no default export'.
import WorkerConstructor from '../workers/monteCarloWorker?worker'; 


export interface UseMonteCarloReturn {
  running: boolean;
  progress: number;
  summary: MonteCarloSummary | null;
  sampleRuns: MonteCarloRun[] | null;
  loadedHistoryId: string | null; // 💥 NOVO: ID do histórico carregado
  runSimulation: (config: MonteCarloConfig) => Promise<void>;
  stopSimulation: () => void;
  loadFromHistory: (item: MonteCarloHistoryItem | null) => void; 
}


export const useMonteCarlo = (): UseMonteCarloReturn => {
    
    // ESTADOS
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [summary, setSummary] = useState<MonteCarloSummary | null>(null);
    const [sampleRuns, setSampleRuns] = useState<MonteCarloRun[] | null>(null);
    const [loadedHistoryId, setLoadedHistoryId] = useState<string | null>(null); // 💥 NOVO ESTADO

    const workerRef = useRef<Worker | null>(null); 
    const configRef = useRef<MonteCarloConfig | null>(null); 
    
    
    useEffect(() => {
        // 1. Inicializa o worker
        const worker = new WorkerConstructor(); // 💥 Usa o construtor correto
        workerRef.current = worker;

        // 2. Listener de Mensagens
        worker.onmessage = (ev: MessageEvent) => {
            const msg = ev.data;
            if (msg.type === 'PROGRESS') {
                setProgress(msg.progress);
            } else if (msg.type === 'RESULT') {
                setSummary(msg.summary);
                setSampleRuns(msg.sampleRuns);
                setRunning(false);
                setProgress(100);

                // 3. Salva o histórico (o refresh virá do MonteCarloPage)
                if (configRef.current) {
                    saveHistory(configRef.current, msg.summary, msg.sampleRuns);
                }
            } else if (msg.type === 'ERROR') {
                console.error("Worker Error:", msg.error);
                setRunning(false);
                setProgress(0);
            }
        };

        // 4. Cleanup
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []); 

    // ... (stopSimulation permanece) ...
  // 💥 Mantenha a ordem: Funções de Ação primeiro
    const stopSimulation = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
            // Recria o worker
            workerRef.current = new WorkerConstructor(); 
            // Re-adiciona o listener (se necessário, mas o useEffect já faz isso no unmount/mount)
        }
        setRunning(false);
    }, []); // Não depende de nada
    
    const runSimulation = useCallback(async (config: MonteCarloConfig) => {
        if (running || !workerRef.current) return;
        
        setRunning(true);
        setProgress(0);
        setSummary(null);
        setSampleRuns(null);
        setLoadedHistoryId(null); // Limpa o ID ao iniciar nova simulação
        
        configRef.current = config; 

        workerRef.current.postMessage({ 
            type: 'START', 
            config: config,
            empiricalR: undefined
        });
    }, [running]);

    
    // 💥 CORRIGIDO: Aceita null para limpar a visualização. Define o ID do histórico.
    const loadFromHistory = useCallback((item: MonteCarloHistoryItem | null) => {
        if (!item) {
             setSummary(null);
             setSampleRuns(null);
             setLoadedHistoryId(null); // Limpa o ID
             return;
        }
        setSummary(item.summary);
        setSampleRuns(item.sampleRuns || null); 
        setRunning(false);
        setProgress(100);
        setLoadedHistoryId(item.id); // Define o ID do histórico
    }, []);

    return {
        running, progress, summary, sampleRuns, loadedHistoryId,
        runSimulation, stopSimulation, loadFromHistory,
    };
};