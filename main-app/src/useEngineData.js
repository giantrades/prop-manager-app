// Hook de dados do motor para containers: cache SWR por rota (volta instantâneo)
// + re-render em qualquer escrita (`datastore:change`). O loader é lido por ref.
// A chave padrão é o pathname da rota — trocar de aba e voltar não pisca skeleton.
import { useLocation } from 'react-router-dom';
import usePageData from './usePageData';

export default function useEngineData(loader, key) {
  const { pathname } = useLocation();
  return usePageData(key ?? pathname, loader);
}
