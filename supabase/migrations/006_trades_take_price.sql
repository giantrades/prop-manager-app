-- Take profit (alvo) do trade. O bridge já envia `takePrice` (o SL/TP é capturado da
-- posição viva), mas a coluna não existia: o sync genérico (camelToSnake) falharia com
-- "column take_price does not exist". Aditivo e idempotente.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS take_price NUMERIC;
