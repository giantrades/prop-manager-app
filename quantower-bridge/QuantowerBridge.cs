// ============================================================
// QuantowerBridge — Local HTTP Bridge for Web Integration
// ============================================================
// This C# strategy runs inside Quantower and exposes a local
// HTTP server so your webapp can auto-sync trading data.
//
// INSTALL:
//   1. Compile this file into a DLL (Quantower Algo / Visual Studio)
//   2. Copy the DLL to Quantower's Strategies folder
//   3. Start the strategy from Strategies Manager
//   4. Your webapp connects to http://localhost:8787 (or external via Tailscale)
//
// ENDPOINTS:
//   GET /status     → connection status + version
//   GET /accounts   → all accounts from all connections
//   GET /trades     → trade history (optional ?from=&to=)
//   GET /positions  → open positions with live P&L
//   GET /orders     → pending orders
// ============================================================
//
// CORREÇÕES NESTA REVISÃO (contra a API real do Quantower, confirmada em
// https://api.quantower.com/docs/):
//   - Trade.GrossPnl (minúsculo) — não "GrossPnL"
//   - Trade não tem "TradeId" — usamos Trade.Id (herdado de TradingObject)
//   - Trade não tem "Swaps" — esse dado só existe em Position, não em Trade.
//     Mantemos o campo Swaps na TradeDto (sempre 0) para não quebrar o
//     contrato da API, mas isso é uma limitação real da plataforma, não bug.
//   - Connection não tem "TradingHours" nessa versão da API — TradingDay
//     passa a ser só a data calendário (UTC) do fill, sem ajuste de sessão.
//   - PositionState/FillData movidos para fora da classe QuantowerBridge
//     (eram private/nested, TradeDtoBuilder não conseguia enxergá-los)
//   - TradeDto tinha CalculatedGrossPnL e Swaps duplicados — removido
//   - StartNewPosition/AddEntryFill marcados como static
//   - Método local não pode mais se chamar "SHA1" (sombreava a classe
//     System.Security.Cryptography.SHA1) — renomeado para ComputeSha1Hash
//   - Bug de lógica: reversão automática nunca disparava porque o código
//     retornava a trade fechada antes de checar remainingQty — corrigido
//   - Bug de lógica: direção da posição revertida estava invertida — corrigido
//   - PositionState.Symbol nunca era preenchido em StartNewPosition — corrigido
//   - fillSequence estava hardcoded como 1 em vários lugares — corrigido
//   - BuildOrdersJson reconstruído (tinha sido colado cortado no meio)
// ============================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;

namespace QuantowerBridge
{
    public class QuantowerBridge : Strategy
    {
        public QuantowerBridge() : base()
        {
            this.Name = "QuantowerBridge";
            this.Description = "Bridge de integração via HTTP API";
        }

        // ── Configuration ──────────────────────────────────
        [InputParameter("HTTP Port", 10)]
        public int Port = 8787;

        [InputParameter("Allow External Access", 20)]
        public bool AllowExternal = false;

        private HttpListener _listener;
        private CancellationTokenSource _cts;
        private Thread _serverThread;

        private static readonly string[] EndpointsList = new[] { "/status", "/accounts", "/trades", "/positions", "/orders", "/health" };

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = false,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals
        };

        // ── Lifecycle ──────────────────────────────────────
        protected override void OnCreated()
        {
            base.OnCreated();
        }

        protected override void OnRun()
        {
            try
            {
                FileLog("OnRun() called");
                _cts = new CancellationTokenSource();
                _listener = new HttpListener();

                bool started = false;

                if (AllowExternal)
                {
                    started = TryStartListener($"http://*:{Port}/");

                    if (!started)
                    {
                        TryReserveUrlAcl(Port);
                        started = TryStartListener($"http://*:{Port}/");
                    }

                    if (!started)
                        started = TryStartListener($"http://+:{Port}/");

                    if (!started)
                    {
                        Log($"⚠️ External access failed, falling back to localhost only", StrategyLoggingLevel.Trading);
                        started = TryStartListener($"http://localhost:{Port}/");
                    }
                }
                else
                {
                    started = TryStartListener($"http://localhost:{Port}/");
                }

                if (!started)
                {
                    Log($"❌ Failed to start HTTP listener on any prefix", StrategyLoggingLevel.Error);
                    return;
                }

                string msg = $"✅ QuantowerBridge started on port {Port} (External: {AllowExternal})";
                Log(msg, StrategyLoggingLevel.Trading);
                FileLog(msg);

                _serverThread = new Thread(ServerLoop)
                {
                    IsBackground = false,
                    Name = "QuantowerBridge-HTTP"
                };
                _serverThread.Start();

                // Block OnRun until server stops (prevents strategy from auto-stopping)
                _serverThread.Join();
            }
            catch (Exception ex)
            {
                string em = $"❌ Failed to start bridge: {ex}";
                Log(em, StrategyLoggingLevel.Error);
                FileLog(em);
            }
        }

        private bool TryStartListener(string prefix)
        {
            try
            {
                _listener.Prefixes.Clear();
                _listener.Prefixes.Add(prefix);
                _listener.Start();
                Log($"🌐 Listening on: {prefix}", StrategyLoggingLevel.Trading);
                return true;
            }
            catch (HttpListenerException ex) when (ex.ErrorCode == 5 || ex.ErrorCode == 183)
            {
                // Access denied (5) or already exists (183) - try next prefix
                Log($"⚠️ Cannot bind {prefix}: {ex.Message}", StrategyLoggingLevel.Trading);
                return false;
            }
            catch (Exception ex)
            {
                Log($"⚠️ Error starting {prefix}: {ex.Message}", StrategyLoggingLevel.Trading);
                return false;
            }
        }

        private void TryReserveUrlAcl(int port)
        {
            try
            {
                var reserve = Process.Start(new ProcessStartInfo
                {
                    FileName = "netsh.exe",
                    Arguments = $"http add urlacl url=http://+:{port}/ user=Everyone",
                    Verb = "runas",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
                reserve?.WaitForExit(3000);

                if (reserve?.ExitCode == 0)
                    Log($"🔐 URL ACL reserved for port {port}", StrategyLoggingLevel.Trading);
                else
                    Log($"⚠️ Could not reserve URL ACL (run Quantower as Admin for external access)", StrategyLoggingLevel.Trading);
            }
            catch (Exception ex)
            {
                Log($"⚠️ URL ACL reservation failed: {ex.Message}", StrategyLoggingLevel.Trading);
            }
        }

        protected override void OnStop()
        {
            try
            {
                _cts?.Cancel();
                _listener?.Stop();
                _listener?.Close();
                string m = "🛑 QuantowerBridge stopped";
                Log(m, StrategyLoggingLevel.Trading);
                FileLog(m);
            }
            catch { }
        }

        // ── File Logging (survives even if Quantower log fails) ──
        // [CORRIGIDO] internal (não private) para que TradeReconstructor e
        // TradeDtoBuilder, que agora vivem fora desta classe, possam logar aqui também.
        private static string _logPath;
        private static readonly object _logLock = new();
        private static string LogPath
        {
            get
            {
                if (_logPath == null)
                {
                    try
                    {
                        string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QuantowerBridge");
                        Directory.CreateDirectory(dir);
                        _logPath = Path.Combine(dir, $"bridge_{DateTime.Now:yyyyMMdd}.log");
                    }
                    catch { _logPath = ""; }
                }
                return _logPath;
            }
        }

        internal static void FileLog(string message)
        {
            try
            {
                string line = $"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}";
                lock (_logLock) { File.AppendAllText(LogPath, line); }
            }
            catch { }
        }

        // ── HTTP Server Loop ───────────────────────────────
        private void ServerLoop()
        {
            while (!_cts.IsCancellationRequested)
            {
                FileLog("ServerLoop: waiting for requests");
                try
                {
                    while (!_cts.IsCancellationRequested && _listener.IsListening)
                    {
                        var context = _listener.GetContext();
                        Task.Run(() => HandleRequest(context));
                    }
                }
                catch (HttpListenerException ex) when (ex.ErrorCode == 995)
                {
                    FileLog($"ServerLoop: listener closed (995), stopping");
                    break;
                }
                catch (HttpListenerException ex)
                {
                    FileLog($"ServerLoop HttpListenerException: {ex.Message} (code={ex.ErrorCode}) — restarting in 2s");
                }
                catch (ObjectDisposedException)
                {
                    FileLog("ServerLoop: listener disposed, stopping");
                    break;
                }
                catch (Exception ex)
                {
                    string em = $"⚠️ ServerLoop error: {ex}";
                    Log(em, StrategyLoggingLevel.Error);
                    FileLog(em);
                }

                if (!_cts.IsCancellationRequested)
                    Thread.Sleep(2000);
            }
            FileLog("ServerLoop exited");
        }

        private void HandleRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            try
            {
                // ALWAYS set CORS headers first - before any other logic
                SetCorsHeaders(response);

                response.ContentType = "application/json; charset=utf-8";

                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 204;
                    response.Close();
                    return;
                }

                string path = request.Url?.AbsolutePath?.ToLower().TrimEnd('/') ?? "";

                // Normalize path - handle cases where funnel might add prefix
                if (path.StartsWith("/status")) path = "/status";
                else if (path.StartsWith("/accounts")) path = "/accounts";
                else if (path.StartsWith("/trades")) path = "/trades";
                else if (path == "/positions" || path == "/positions/close") { /* keep as-is */ }
                else if (path.StartsWith("/positions")) path = "/positions";
                else if (path.StartsWith("/orders")) path = "/orders";

                // Silently ignore common scanner/bot paths (no log, no 404)
                if (path == "/auth" || path == "/robots.txt" || path == "/.env" ||
                    path == "/favicon.ico" || path == "/wp-admin" || path == "/xmlrpc.php" ||
                    path == "/administrator" || path == "/.git/config" || path == "/aws.yml")
                {
                    response.StatusCode = 204;
                    response.Close();
                    return;
                }

                string json;

                switch (path)
                {
                    case "/status":
                        json = BuildStatusJson(Port);
                        break;
                    case "/accounts":
                        json = BuildAccountsJson();
                        break;
                    case "/trades":
                        json = BuildTradesJson(request.QueryString);
                        break;
                    case "/positions/close":
                        json = HandleClosePosition(request);
                        break;
                    case "/positions":
                        json = BuildPositionsJson();
                        break;
                    case "/orders":
                        json = BuildOrdersJson();
                        break;
                    case "/health":
                        json = JsonSerializer.Serialize(new { status = "ok", timestamp = DateTime.UtcNow.ToString("O") }, JsonOptions);
                        break;
                    default:
                        Log($"⚠️ 404 Not Found: {path}", StrategyLoggingLevel.Trading);
                        response.StatusCode = 404;
                        json = JsonSerializer.Serialize(new { error = "Unknown endpoint", endpoints = EndpointsList }, JsonOptions);
                        break;
                }

                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentLength64 = buffer.Length;
                response.OutputStream.Write(buffer, 0, buffer.Length);
            }
            catch (Exception ex)
            {
                string em = $"❌ Request handling error: {ex}";
                Log(em, StrategyLoggingLevel.Error);
                FileLog(em);
                try
                {
                    SetCorsHeaders(response);
                    response.StatusCode = 500;
                    byte[] err = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { error = ex.Message }, JsonOptions));
                    response.ContentLength64 = err.Length;
                    response.ContentType = "application/json; charset=utf-8";
                    response.OutputStream.Write(err, 0, err.Length);
                }
                catch { }
            }
            finally
            {
                try { response.Close(); } catch { }
            }
        }

        private static void SetCorsHeaders(HttpListenerResponse response)
        {
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
            response.Headers.Add("Access-Control-Max-Age", "86400");
            response.Headers.Add("Access-Control-Allow-Private-Network", "true");
        }

        private static string HandleClosePosition(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
            {
                return JsonSerializer.Serialize(new { success = false, error = "Method not allowed. Use POST." }, JsonOptions);
            }

            try
            {
                string body;
                using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
                {
                    body = reader.ReadToEnd();
                }

                var closeRequest = JsonSerializer.Deserialize<ClosePositionRequest>(body, JsonOptions);
                if (closeRequest == null || string.IsNullOrEmpty(closeRequest.Id))
                {
                    return JsonSerializer.Serialize(new { success = false, error = "Missing required field: id" }, JsonOptions);
                }

                var position = Core.Instance.Positions.FirstOrDefault(p => p.Id == closeRequest.Id);
                if (position == null)
                {
                    return JsonSerializer.Serialize(new { success = false, error = $"Position not found: {closeRequest.Id}" }, JsonOptions);
                }

                position.Close();
                string successMsg = $"Position {closeRequest.Id} closed successfully";
                FileLog($"[CLOSE] {successMsg}");
                return JsonSerializer.Serialize(new { success = true, message = successMsg }, JsonOptions);
            }
            catch (Exception ex)
            {
                FileLog($"[CLOSE] Error: {ex.Message}");
                return JsonSerializer.Serialize(new { success = false, error = ex.Message }, JsonOptions);
            }
        }

        private class ClosePositionRequest
        {
            public string Id { get; set; }
        }

        // ── JSON Builders (using System.Text.Json) ───────────

        private static string BuildStatusJson(int port)
        {
            var connections = Core.Instance.Connections.Connected
                .Select(c => new { id = c.Id, name = c.Name })
                .ToArray();

            var tradesCount = Core.Instance.GetTrades(new TradesHistoryRequestParameters()).Count;

            var status = new
            {
                online = true,
                version = "1.0.0",
                platform = "quantower",
                port,
                timestamp = DateTime.UtcNow.ToString("O"),
                connectionsCount = connections.Length,
                connections,
                accountsCount = Core.Instance.Accounts.Length,
                positionsCount = Core.Instance.Positions.Length,
                tradesCount
            };

            return JsonSerializer.Serialize(status, JsonOptions);
        }

        private static string BuildAccountsJson()
        {
            var accounts = new List<object>();

            foreach (Account acc in Core.Instance.Accounts)
            {
                string connName = "";
                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == acc.ConnectionId);
                    connName = conn?.Name ?? "";
                }
                catch { }

                accounts.Add(new
                {
                    id = acc.Id,
                    name = acc.Name,
                    balance = acc.Balance,
                    currency = acc.AccountCurrency?.Name ?? "USD",
                    connectionId = acc.ConnectionId,
                    connectionName = connName
                });
            }

            var result = new
            {
                accounts,
                count = accounts.Count,
                timestamp = DateTime.UtcNow.ToString("O")
            };

            return JsonSerializer.Serialize(result, JsonOptions);
        }

        // ═══════════════════════════════════════════════════════════════
        // /trades — usa TradeReconstructor (definido fora desta classe)
        // ═══════════════════════════════════════════════════════════════

        private static string BuildTradesJson(System.Collections.Specialized.NameValueCollection query)
        {
            DateTime? fromDate = null;
            DateTime? toDate = null;

            if (!string.IsNullOrEmpty(query["from"]))
                if (DateTime.TryParse(query["from"], out DateTime f)) fromDate = f;

            if (!string.IsNullOrEmpty(query["to"]))
                if (DateTime.TryParse(query["to"], out DateTime t)) toDate = t;

            DateTime from = fromDate ?? DateTime.UtcNow.AddDays(-30);
            DateTime to = toDate ?? DateTime.UtcNow;

            var allFills = Core.Instance.GetTrades(new TradesHistoryRequestParameters { From = from, To = to })
                .Where(t => !string.IsNullOrEmpty(t.PositionId))
                .OrderBy(t => t.DateTime)
                .ThenBy(t => t.OrderId)
                .ThenBy(t => t.Id)
                .ToList();

            // TradingDay calculado 1x por fill + agrupamento por AccountId + Symbol (sem TradingDay)
            var fillsWithDay = allFills.Select(f => new
            {
                Fill = f,
                TradingDay = TradeHelpers.GetTradingDay(f)
            }).ToList();

            var groups = fillsWithDay
                .GroupBy(x => new
                {
                    AccountId = x.Fill.Account?.Id ?? "",
                    Symbol = x.Fill.Symbol?.Name ?? ""
                });

            var allTrades = new List<TradeDto>();

            foreach (var group in groups)
            {
                var fillsWithDayInGroup = group
                    .OrderBy(x => x.Fill.DateTime)
                    .ThenBy(x => x.Fill.OrderId)
                    .ThenBy(x => x.Fill.Id)
                    .Select(x => (Fill: x.Fill, TradingDay: x.TradingDay))
                    .ToList();

                var trades = TradeReconstructor.ReconstructTrades(fillsWithDayInGroup);
                allTrades.AddRange(trades);
            }

            var jsonTrades = allTrades.Select(t => new
            {
                id = t.Id,
                symbol = t.Symbol,
                side = t.Side,
                quantity = t.Quantity,
                entryPrice = t.EntryPrice,
                exitPrice = t.ExitPrice,
                entryDateTime = t.EntryDateTime,
                exitDateTime = t.ExitDateTime,
                tradingDay = t.TradingDay,
                grossPnl = t.GrossPnL,
                calculatedGrossPnL = t.CalculatedGrossPnL,
                netPnl = t.NetPnL,
                fee = t.Fee,
                swaps = t.Swaps,
                positionId = t.PositionId,
                accountId = t.AccountId,
                accountName = t.AccountName,
                connectionId = t.ConnectionId,
                connectionName = t.ConnectionName,
                platformTradeId = t.PlatformTradeId,
                entryCount = t.EntryCount,
                exitCount = t.ExitCount,
                scaleInCount = t.ScaleInCount,
                partialExitCount = t.PartialExitCount,
                fillSequence = t.FillSequence,
                averageEntry = t.AverageEntry,
                averageExit = t.AverageExit,
                risk = t.Risk,
                reward = t.Reward,
                holdingSeconds = t.HoldingSeconds,
                maxScaleIn = t.MaxScaleIn,
                firstOrderId = t.FirstOrderId,
                lastOrderId = t.LastOrderId,
                firstTradeId = t.FirstTradeId,
                lastTradeId = t.LastTradeId
            }).ToList();

            return JsonSerializer.Serialize(new
            {
                trades = jsonTrades,
                count = jsonTrades.Count,
                timestamp = DateTime.UtcNow.ToString("O")
            }, JsonOptions);
        }

        private static string BuildPositionsJson()
        {
            var positions = new List<object>();

            foreach (Position pos in Core.Instance.Positions)
            {
                string connName = "";
                string symbol = "";
                string side = "";
                string accountId = "";
                string accountName = "";

                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == pos.ConnectionId);
                    connName = conn?.Name ?? "";
                    symbol = pos.Symbol?.Name ?? "";
                    side = pos.Side.ToString();

                    if (pos.Account != null)
                    {
                        accountId = pos.Account.Id ?? "";
                        accountName = pos.Account.Name ?? "";
                    }

                    if (pos.OpenPrice == 0 || pos.OpenTime == DateTime.MinValue)
                    {
                        FileLog($"[POSITIONS] WARNING: OpenPrice={pos.OpenPrice} OpenTime={pos.OpenTime} for {pos.Id}");
                    }

                    FileLog($"[POSITIONS] {pos.Id}: accountId={accountId}, accountName={accountName}, symbol={symbol}, side={side}");
                }
                catch (Exception ex)
                {
                    FileLog($"[POSITIONS] Error for {pos.Id}: {ex.Message}");
                }

                double grossPnl = pos.GrossPnL?.Value ?? 0;
                double fee = pos.Fee?.Value ?? 0;
                double swaps = pos.Swaps?.Value ?? 0;
                double netPnl = pos.NetPnL?.Value ?? (grossPnl + fee + swaps);

                positions.Add(new
                {
                    id = pos.Id,
                    symbol,
                    side,
                    quantity = pos.Quantity,
                    openPrice = pos.OpenPrice,
                    currentPrice = pos.CurrentPrice,
                    openTime = pos.OpenTime.ToString("O"),
                    grossPnl = grossPnl,
                    netPnl = netPnl,
                    fee = fee,
                    swaps = swaps,
                    accountId,
                    accountName,
                    connectionId = pos.ConnectionId ?? "",
                    connectionName = connName,
                    isLive = true
                });
            }

            var result = new
            {
                positions,
                count = positions.Count,
                timestamp = DateTime.UtcNow.ToString("O")
            };

            return JsonSerializer.Serialize(result, JsonOptions);
        }

        // [RECONSTRUÍDO] este método tinha sido colado cortado no meio,
        // faltando o corpo do foreach, a variável "result" e a chave de fechamento.
        private static string BuildOrdersJson()
        {
            var orders = new List<object>();

            foreach (Order order in Core.Instance.Orders)
            {
                string connName = "";
                string symbol = "";
                string side = "";

                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == order.ConnectionId);
                    connName = conn?.Name ?? "";
                    symbol = order.Symbol?.Name ?? "";
                    side = order.Side.ToString();
                }
                catch { }

                orders.Add(new
                {
                    id = order.Id,
                    symbol,
                    side,
                    quantity = order.TotalQuantity,
                    filledQuantity = order.FilledQuantity,
                    remainingQuantity = order.RemainingQuantity,
                    price = order.Price,
                    orderTypeId = order.OrderTypeId,
                    status = order.Status.ToString(),
                    positionId = order.PositionId ?? "",
                    connectionId = order.ConnectionId ?? "",
                    connectionName = connName
                });
            }

            var result = new
            {
                orders,
                count = orders.Count,
                timestamp = DateTime.UtcNow.ToString("O")
            };

            return JsonSerializer.Serialize(result, JsonOptions);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TIPOS DE RECONSTRUÇÃO DE TRADES
    // [CORRIGIDO] Movidos para fora da classe QuantowerBridge (nível de
    // namespace) para que TradeReconstructor e TradeDtoBuilder consigam
    // enxergá-los sem ambiguidade de tipo aninhado.
    // ═══════════════════════════════════════════════════════════════

    internal class FillData
    {
        public decimal Qty, Price;
        public DateTime Time;
        public decimal Fee, Swap, GrossPnL;
        public bool IsExit;
        public int Sequence;
        public string OrderId, TradeId;
    }

    internal class PositionState
    {
        public string Symbol, AccountId, AccountName, PositionId, ConnectionId, ConnectionName;
        public string Direction = "";
        public DateTime OpenTime;
        public DateTime? ExitTime;
        public DateTime TradingDay;
        public decimal NetQty = 0;

        public List<FillData> Entries = new(), Exits = new();

        // AllFills guarda a sequência cronológica completa (entries + exits
        // intercalados na ordem real de execução). Existe especificamente para
        // alimentar os futuros widgets de MAE (Maximum Adverse Excursion) e
        // MFE (Maximum Favorable Excursion) na Dashboard, que precisam do
        // histórico de fills de cada trade. Não é redundante para esse propósito:
        // Entries e Exits sozinhos perdem a ordem de intercalação entre os dois grupos.
        public List<FillData> AllFills = new();

        public int FillSequence = 0;
        public bool HasEntries => Entries.Count > 0;
        public string FirstOrderId, LastOrderId, FirstTradeId, LastTradeId;
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS COMPARTILHADOS
    // [CORRIGIDO] NormalizeFee e GetTradingDay viviam dentro de TradeDtoBuilder
    // mas eram chamados de QuantowerBridge — movidos para uma classe
    // compartilhada. SHA1 renomeado para ComputeSha1Hash para não sombrear
    // System.Security.Cryptography.SHA1.
    // ═══════════════════════════════════════════════════════════════

    internal static class TradeHelpers
    {
        // [CORRIGIDO] Connection não expõe TradingHours nesta versão da API do
        // Quantower. TradingDay vira simplesmente a data calendário (UTC) do
        // fill — sem ajuste por horário de sessão. Isso é uma limitação real
        // da API disponível, não um bug: se no futuro a API expuser sessão de
        // pregão por símbolo/conexão, este é o único lugar a atualizar.
        internal static DateTime GetTradingDay(Trade fill)
        {
            return fill.DateTime.Date;
        }

        // Convenção adotada: fee sempre NEGATIVA (representa custo).
        // Trata null (alguns brokers não retornam PnLItem.Value).
        // [CORRIGIDO] PnLItem.Value é double, não decimal (confirmado pelo erro de build
        // "não é possível converter de double? para decimal?" — mesma convenção já usada
        // em BuildPositionsJson: double fee = pos.Fee?.Value ?? 0). A conversão pra decimal
        // acontece aqui dentro, uma única vez, em vez de exigir cast em cada call site.
        internal static decimal NormalizeFee(double? raw)
        {
            var value = (decimal)(raw ?? 0);
            return value > 0 ? -value : value;
        }

        internal static string ComputeSha1Hash(string input)
        {
            using var sha1 = SHA1.Create();
            var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(hash).Replace("-", "").ToLower();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRADE RECONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    internal static class TradeReconstructor
    {
        internal static List<TradeDto> ReconstructTrades(List<(Trade Fill, DateTime TradingDay)> fills)
        {
            var trades = new List<TradeDto>();
            var current = new PositionState();
            int fillSequence = 0;

            foreach (var (fill, tradingDay) in fills)
            {
                fillSequence++;

                if (current.HasEntries && current.PositionId != fill.PositionId)
                {
                    QuantowerBridge.FileLog($"[RECON] WARNING: PositionId changed mid-trade: was={current.PositionId} now={fill.PositionId} Symbol={fill.Symbol?.Name}");
                }

                // [CORRIGIDO] passa o fillSequence real, não mais hardcoded como 1
                var (nextState, closedTrades) = ApplyFill(current, fill, tradingDay, fillSequence);

                foreach (var closed in closedTrades)
                {
                    // [CORRIGIDO] propriedades corretas da TradeDto (Side/EntryPrice/ExitPrice/HoldingSeconds
                    // — a TradeDto não tem Direction, AvgEntryPrice, AvgExitPrice nem Duration)
                    QuantowerBridge.FileLog($"[RECON] Trade Closed: Symbol={closed.Symbol} Dir={closed.Side} TradingDay={closed.TradingDay} Entries={closed.EntryCount} Exits={closed.ExitCount} AvgEntry={closed.EntryPrice:F2} AvgExit={closed.ExitPrice:F2} Gross={closed.GrossPnL:F2} CalcGross={closed.CalculatedGrossPnL:F2} Fee={closed.Fee:F2} Net={closed.NetPnL:F2} HoldingSec={closed.HoldingSeconds:F0}");

                    if (Math.Abs(closed.GrossPnL - closed.CalculatedGrossPnL) > 0.01m)
                    {
                        QuantowerBridge.FileLog($"[AUDIT] WARNING: GrossPnL diverge do calculado. Symbol={closed.Symbol} Reported={closed.GrossPnL:F2} Calculated={closed.CalculatedGrossPnL:F2} Diff={(closed.GrossPnL - closed.CalculatedGrossPnL):F2}");
                    }

                    trades.Add(closed);
                }

                current = nextState;
            }
            return trades;
        }

        private static (PositionState, List<TradeDto>) ApplyFill(
            PositionState current,
            Trade fill,
            DateTime tradingDay,
            int sequence)
        {
            var noClosedTrades = new List<TradeDto>();
            var isBuy = fill.Side == Side.Buy;
            var qty = (decimal)fill.Quantity;
            var price = (decimal)fill.Price;
            var time = fill.DateTime;

            if (current.NetQty == 0)
            {
                var fresh = StartNewPosition(fill, tradingDay);
                fresh = AddEntryFill(fresh, qty, price, time, sequence, fill.OrderId, fill.Id);
                fresh.NetQty = isBuy ? qty : -qty;
                return (fresh, noClosedTrades);
            }

            var oldNetQty = current.NetQty;
            bool positionIsLong = oldNetQty > 0;
            bool fillReducesPosition = positionIsLong ? !isBuy : isBuy;

            current.LastOrderId = fill.OrderId;
            current.LastTradeId = fill.Id;

            if (!fillReducesPosition)
            {
                // Scale-in: mesmo lado, só aumenta a posição
                var scaled = AddEntryFill(current, qty, price, time, sequence, fill.OrderId, fill.Id);
                scaled.NetQty += isBuy ? qty : -qty;
                return (scaled, noClosedTrades);
            }

            // Fill reduz ou fecha a posição
            var closeQty = Math.Min(Math.Abs(oldNetQty), qty);
            var remainingQty = qty - closeQty;

            // Fee só é normalizada/usada no fill de SAÍDA — é o único lugar em que importa
            var fee = TradeHelpers.NormalizeFee(fill.Fee?.Value);
            var grossPnL = (decimal)(fill.GrossPnl?.Value ?? 0); // [CORRIGIDO] GrossPnl minúsculo — API real do Trade
            // [CORRIGIDO] Trade não expõe Swap/Swaps na API real — só Position tem.
            // Mantemos o campo por compatibilidade de schema, sempre 0 no nível de fill.
            var swap = 0m;

            var exitFill = new FillData
            {
                Qty = closeQty,
                Price = price,
                Time = time,
                Fee = fee,
                Swap = swap,
                GrossPnL = grossPnL,
                IsExit = true,
                Sequence = sequence,
                OrderId = fill.OrderId,
                TradeId = fill.Id
            };
            current.Exits.Add(exitFill);
            current.AllFills.Add(exitFill);
            current.ExitTime = time;
            current.NetQty = positionIsLong ? oldNetQty - closeQty : oldNetQty + closeQty;
            current.FillSequence = sequence;

            if (current.NetQty == 0)
            {
                // [CORRIGIDO] bug de lógica: antes o código retornava aqui dentro do
                // "if (current.HasEntries)" e NUNCA chegava a checar remainingQty,
                // então a reversão automática nunca disparava. Agora primeiro
                // coletamos a trade fechada, depois checamos se sobra quantidade.
                var closedTrades = new List<TradeDto>();
                if (current.HasEntries)
                {
                    closedTrades.Add(TradeDtoBuilder.BuildTradeDto(current));
                }

                if (remainingQty > 0)
                {
                    // [CORRIGIDO] direção estava invertida (isBuy ? "SHORT" : "LONG").
                    // Um fill de BUY que reverte uma SHORT deve abrir uma LONG, e vice-versa.
                    var reversed = StartNewPosition(fill, tradingDay);
                    reversed.Direction = isBuy ? "LONG" : "SHORT";
                    reversed = AddEntryFill(reversed, remainingQty, price, time, sequence, fill.OrderId, fill.Id);
                    reversed.NetQty = isBuy ? remainingQty : -remainingQty;

                    QuantowerBridge.FileLog($"[RECON] REVERSÃO: Symbol={fill.Symbol?.Name} Closed={current.Direction} New={reversed.Direction} RemainingQty={remainingQty}");
                    return (reversed, closedTrades);
                }

                return (new PositionState(), closedTrades);
            }

            // Partial exit — posição continua aberta no mesmo sentido
            return (current, noClosedTrades);
        }

        // [CORRIGIDO] static — antes causava "referência de objeto necessária"
        // por ser chamado de dentro de métodos estáticos.
        // [CORRIGIDO] agora recebe e preenche Symbol e TradingDay, que faltavam.
        private static PositionState StartNewPosition(Trade fill, DateTime tradingDay)
        {
            var isBuy = fill.Side == Side.Buy;
            return new PositionState
            {
                Direction = isBuy ? "LONG" : "SHORT",
                Symbol = fill.Symbol?.Name ?? "",
                OpenTime = fill.DateTime,
                AccountId = fill.Account?.Id ?? "",
                AccountName = fill.Account?.Name ?? "",
                PositionId = fill.PositionId,
                ConnectionId = fill.ConnectionId ?? "",
                ConnectionName = Core.Instance.Connections.Connected.FirstOrDefault(c => c.Id == fill.ConnectionId)?.Name ?? "",
                TradingDay = tradingDay,
                FirstOrderId = fill.OrderId,
                LastOrderId = fill.OrderId,
                FirstTradeId = fill.Id,
                LastTradeId = fill.Id
            };
        }

        // [CORRIGIDO] static; sem parâmetro "fee" — entradas nunca carregam fee
        // (só a fee dos exits entra no cálculo final, ver TradeDtoBuilder).
        private static PositionState AddEntryFill(PositionState state, decimal qty, decimal price, DateTime time, int sequence, string orderId, string tradeId)
        {
            var entry = new FillData
            {
                Qty = qty,
                Price = price,
                Time = time,
                Fee = 0,
                Swap = 0,
                GrossPnL = 0,
                IsExit = false,
                Sequence = sequence,
                OrderId = orderId,
                TradeId = tradeId
            };
            state.Entries.Add(entry);
            state.AllFills.Add(entry);
            state.FillSequence = sequence;
            state.LastOrderId = orderId;
            state.LastTradeId = tradeId;
            return state;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRADE DTO
    // [CORRIGIDO] CalculatedGrossPnL e Swaps estavam declarados duas vezes,
    // causando todos os erros de "ambiguidade" e "já contém definição".
    // ═══════════════════════════════════════════════════════════════

    public class TradeDto
    {
        public string Id { get; set; }
        public string Symbol { get; set; }
        public string Side { get; set; }
        public decimal Quantity { get; set; }
        public decimal EntryPrice { get; set; }
        public decimal ExitPrice { get; set; }
        public string EntryDateTime { get; set; }
        public string ExitDateTime { get; set; }
        public string TradingDay { get; set; }
        public decimal GrossPnL { get; set; }
        public decimal CalculatedGrossPnL { get; set; }
        public decimal NetPnL { get; set; }
        public decimal Fee { get; set; }
        public decimal Swaps { get; set; } // sempre 0 — ver comentário em ApplyFill sobre Trade não ter Swaps
        public string PositionId { get; set; }
        public string AccountId { get; set; }
        public string AccountName { get; set; }
        public string ConnectionId { get; set; }
        public string ConnectionName { get; set; }
        public string PlatformTradeId { get; set; }
        public int EntryCount { get; set; }
        public int ExitCount { get; set; }
        public int ScaleInCount { get; set; }
        public int PartialExitCount { get; set; }
        public int FillSequence { get; set; }
        public decimal AverageEntry { get; set; }
        public decimal AverageExit { get; set; }
        public decimal Risk { get; set; }
        public decimal Reward { get; set; }
        public double HoldingSeconds { get; set; }
        public int MaxScaleIn { get; set; }
        public string FirstOrderId { get; set; }
        public string LastOrderId { get; set; }
        public string FirstTradeId { get; set; }
        public string LastTradeId { get; set; }
    }

    // ═══════════════════════════════════════════════════════════════
    // TRADE DTO BUILDER
    // ═══════════════════════════════════════════════════════════════

    internal static class TradeDtoBuilder
    {
        internal static TradeDto BuildTradeDto(PositionState closedState)
        {
            var entries = closedState.Entries;
            var exits = closedState.Exits;

            // Single-pass: cada soma calculada uma única vez e reutilizada
            var entryQty = entries.Sum(e => e.Qty);
            var entryNotional = entries.Sum(e => e.Price * e.Qty);
            var exitQty = exits.Sum(e => e.Qty);
            var exitNotional = exits.Sum(e => e.Price * e.Qty);

            var avgEntry = entryQty > 0 ? entryNotional / entryQty : 0;
            var avgExit = exitQty > 0 ? exitNotional / exitQty : 0;

            var grossPnL = exits.Sum(e => e.GrossPnL);
            var totalFees = exits.Sum(e => e.Fee);
            var totalSwaps = exits.Sum(e => e.Swap); // sempre 0 hoje — Trade não expõe swap por fill
            var netPnL = grossPnL - totalFees - totalSwaps;

            var directionSign = closedState.Direction == "LONG" ? 1 : -1;
            var calculatedGrossPnL = (avgExit - avgEntry) * entryQty * directionSign;

            var idInput = $"{closedState.AccountId}|{closedState.Symbol}|{closedState.OpenTime:O}|{closedState.ExitTime:O}|{closedState.FirstOrderId}";
            var platformTradeId = "qt_" + TradeHelpers.ComputeSha1Hash(idInput);

            var holdingSeconds = closedState.ExitTime.HasValue
                ? (closedState.ExitTime.Value - closedState.OpenTime).TotalSeconds
                : 0;

            return new TradeDto
            {
                Id = closedState.PositionId,
                Symbol = closedState.Symbol,
                Side = closedState.Direction,
                Quantity = entryQty,
                EntryPrice = Math.Round(avgEntry, 6),
                ExitPrice = Math.Round(avgExit, 6),
                EntryDateTime = closedState.OpenTime.ToString("O"),
                ExitDateTime = closedState.ExitTime?.ToString("O"),
                TradingDay = closedState.TradingDay.ToString("yyyy-MM-dd"),
                GrossPnL = Math.Round(grossPnL, 2),
                CalculatedGrossPnL = Math.Round(calculatedGrossPnL, 2),
                NetPnL = Math.Round(netPnL, 2),
                Fee = Math.Round(totalFees, 2),
                Swaps = Math.Round(totalSwaps, 2),
                PositionId = closedState.PositionId,
                AccountId = closedState.AccountId,
                AccountName = closedState.AccountName,
                ConnectionId = closedState.ConnectionId,
                ConnectionName = closedState.ConnectionName,
                PlatformTradeId = platformTradeId,
                EntryCount = entries.Count,
                ExitCount = exits.Count,
                ScaleInCount = Math.Max(0, entries.Count - 1),
                PartialExitCount = Math.Max(0, exits.Count - 1),
                FillSequence = closedState.FillSequence,
                AverageEntry = Math.Round(avgEntry, 6),
                AverageExit = Math.Round(avgExit, 6),
                Risk = 0,
                Reward = 0,
                HoldingSeconds = holdingSeconds,
                MaxScaleIn = Math.Max(0, entries.Count - 1),
                FirstOrderId = closedState.FirstOrderId,
                LastOrderId = closedState.LastOrderId,
                FirstTradeId = closedState.FirstTradeId,
                LastTradeId = closedState.LastTradeId
            };
        }
    }
}