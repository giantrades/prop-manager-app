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
        private static void FileLog(string message)
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
        // INTERNAL DTOs & RECONSTRUCTOR
        // ═══════════════════════════════════════════════════════════════

        private class FillData
        {
            public decimal Qty, Price;
            public DateTime Time;
            public decimal Fee, Swap, GrossPnL;
            public bool IsExit;
            public int Sequence;
            public string OrderId, TradeId;
            
            // Constructor for entry fills (no fee/swap/grosspnl)
            public FillData(decimal qty, decimal price, DateTime time, int sequence, string orderId, string tradeId)
            {
                Qty = qty;
                Price = price;
                Time = time;
                Fee = 0;
                Swap = 0;
                GrossPnL = 0;
                IsExit = false;
                Sequence = sequence;
                OrderId = orderId;
                TradeId = tradeId;
            }
            
            // Constructor for exit fills
            public FillData(decimal qty, decimal price, DateTime time, decimal fee, decimal grossPnL, string orderId, string tradeId)
            {
                Qty = qty;
                Price = price;
                Time = time;
                Fee = fee;
                Swap = 0;
                GrossPnL = grossPnL;
                IsExit = true;
                Sequence = 1;
                OrderId = orderId;
                TradeId = tradeId;
            }
        }

        private class PositionState
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
        // TRADE RECONSTRUCTOR — v3.1 (reversão automática + SHA1 ID + AllFills para MAE/MFE)
        // ═══════════════════════════════════════════════════════════════

        private static List<TradeDto> ReconstructTrades(
            List<(Trade Fill, DateTime TradingDay)> fills,
            Dictionary<string, Connection> connections)
        {
            var trades = new List<TradeDto>();
            var current = new PositionState();
            int fillSequence = 0;

            foreach (var (fill, tradingDay) in fills)
            {
                fillSequence++;

                if (current.HasEntries && current.PositionId != fill.PositionId)
                {
                    FileLog($"[RECON] WARNING: PositionId changed mid-trade: was={current.PositionId} now={fill.PositionId} Symbol={fill.Symbol?.Name}");
                }

                var (nextState, closedTrades) = ApplyFill(current, fill, tradingDay, 1);

                foreach (var closed in closedTrades)
                {
                    FileLog($"[RECON] Trade Closed: Symbol={closed.Symbol} Dir={closed.Direction} TradingDay={closed.TradingDay:yyyy-MM-dd} Entries={closed.EntryCount} Exits={closed.ExitCount} AvgEntry={closed.AvgEntryPrice:F2} AvgExit={closed.AvgExitPrice:F2} Gross={closed.GrossPnL:F2} CalcGross={closed.CalculatedGrossPnL:F2} Fee={closed.Fee:F2} Net={closed.NetPnL:F2} Dur={closed.Duration}");

                    if (Math.Abs(closed.GrossPnL - closed.CalculatedGrossPnL) > 0.01m)
                    {
                        FileLog($"[AUDIT] WARNING: GrossPnL diverge do calculado. Symbol={closed.Symbol} Reported={closed.GrossPnL:F2} Calculated={closed.CalculatedGrossPnL:F2} Diff={(closed.GrossPnL - closed.CalculatedGrossPnL):F2}");
                    }

                    trades.Add(closed);
                }

                current = nextState;
            }
            return trades;
        }

// ═══════════════════════════════════════════════════════════════
// ApplyFill — v3.1 (reversão automática + SHA1 ID + AllFills para MAE/MFE)
// ═══════════════════════════════════════════════════════════════

private static (PositionState, List<TradeDto>) ApplyFill(
    PositionState current,
    Trade fill,
    DateTime tradingDay,
    int sequence)
{
    var isBuy = fill.Side == Side.Buy;
    var qty = (decimal)fill.Quantity;
    var price = (decimal)fill.Price;

    if (current.NetQty == 0)
    {
        var fresh = StartNewPosition(fill, tradingDay);
        fresh = AddEntryFill(fresh, (decimal)fill.Quantity, (decimal)fill.Price, fill.DateTime, 1, fill.OrderId, fill.Id);
        fresh.NetQty = isBuy ? (decimal)fill.Quantity : -(decimal)fill.Quantity;
        return (fresh, new List<TradeDto>());
    }

    var oldNetQty = current.NetQty;
    bool positionIsLong = oldNetQty > 0;
    bool fillReducesPosition = positionIsLong ? !isBuy : isBuy;

    current.LastOrderId = fill.OrderId;
    current.LastTradeId = fill.Id;

    if (!fillReducesPosition)
    {
        var scaled = AddEntryFill(current, (decimal)fill.Quantity, (decimal)fill.Price, fill.DateTime, 1, fill.OrderId, fill.Id);
        scaled.NetQty += isBuy ? (decimal)fill.Quantity : -(decimal)fill.Quantity;
        return (scaled, new List<TradeDto>());
    }

    var closeQty = Math.Min(Math.Abs(oldNetQty), (decimal)fill.Quantity);
    var remainingQty = (decimal)fill.Quantity - closeQty;

    var fee = NormalizeFee(fill.Fee?.Value);
    var grossPnL = (decimal)(fill.GrossPnl?.Value ?? 0);

var exitFill = new FillData(
    (decimal)closeQty,
    (decimal)fill.Price,
    fill.DateTime,
    NormalizeFee(fill.Fee?.Value),
    (decimal)(fill.GrossPnl?.Value ?? 0),
    fill.OrderId,
    fill.Id
);
    current.Exits.Add(exitFill);
    current.AllFills.Add(exitFill);
    current.ExitTime = fill.DateTime;
    current.NetQty = current.NetQty > 0 ? oldNetQty - closeQty : oldNetQty + closeQty;

    if (current.NetQty == 0)
    {
        if (current.HasEntries)
        {
            return (new PositionState(), new List<TradeDto> { TradeDtoBuilder.BuildTradeDto(current) });
        }

        if (remainingQty > 0)
        {
            var reversed = StartNewPosition(fill, tradingDay);
            reversed.Direction = fill.Side == Side.Buy ? "SHORT" : "LONG";
            reversed = AddEntryFill(reversed, remainingQty, (decimal)fill.Price, fill.DateTime, 1, fill.OrderId, fill.Id);
            reversed.NetQty = fill.Side == Side.Buy ? remainingQty : -remainingQty;

            FileLog($"[RECON] REVERSÃO: Symbol={fill.Symbol?.Name} Closed={current.Direction} New={reversed.Direction} RemainingQty={remainingQty}");
            return (reversed, new List<TradeDto> { TradeDtoBuilder.BuildTradeDto(current) });
        }

        return (new PositionState(), new List<TradeDto>());
    }

    return (current, new List<TradeDto>());
}

        private static PositionState StartNewPosition(Trade fill, DateTime tradingDay)
        {
            var isBuy = fill.Side == Side.Buy;
            return new PositionState
            {
                Symbol = fill.Symbol?.Name ?? "",
                Direction = fill.Side == Side.Buy ? "LONG" : "SHORT",
                OpenTime = fill.DateTime,
                TradingDay = tradingDay,
                AccountId = fill.Account?.Id ?? "",
                AccountName = fill.Account?.Name ?? "",
                PositionId = fill.PositionId,
                ConnectionId = fill.ConnectionId ?? "",
                ConnectionName = Core.Instance.Connections.Connected.FirstOrDefault(c => c.Id == fill.ConnectionId)?.Name ?? "",
                FirstOrderId = fill.OrderId,
                LastOrderId = fill.OrderId,
                FirstTradeId = fill.Id,
                LastTradeId = fill.Id
            };
        }

        // [CORRIGIDO v3] assinatura sem `fee` — entradas nunca carregam fee
        static PositionState AddEntryFill(PositionState state, decimal qty, decimal price, DateTime time, int sequence, string orderId, string tradeId)
        {
            var entry = new FillData(qty, price, time, sequence, orderId, tradeId);
            state.Entries.Add(entry);
            state.AllFills.Add(entry);
            state.FillSequence = sequence;
            state.LastOrderId = orderId;
            state.LastTradeId = tradeId;
            return state;
        }

        // ═══════════════════════════════════════════════════════════════
        // BUILD TRADES JSON (ENTRY POINT)
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

            // Calcula TradingDay 1x por fill + Agrupa por AccountId + Symbol
            var fillsWithDay = allFills.Select(f => new
            {
                Fill = f,
                TradingDay = GetTradingDay(f, f.ConnectionId)
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
                var fillsWithDayInGroup = group.OrderBy(x => x.Fill.DateTime)
                                                .ThenBy(x => x.Fill.OrderId)
                                                .ThenBy(x => x.Fill.Id)
                                                .ToList();

                var trades = ReconstructTrades(fillsWithDayInGroup, Core.Instance.Connections.Connected.ToDictionary(c => c.Id));
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
                netPnl = t.NetPnL,
                fee = t.Fee,
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
                lastTradeId = t.LastTradeId,
                calculatedGrossPnL = t.CalculatedGrossPnL,
                swaps = t.Swaps
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
                    price = order.Price,
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

        // ═══════════════════════════════════════════════════════════════
        // TRADE DTO & BUILDER
        // ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// TRADE DTO & BUILDER
// ════════════════════════════════════════════════════════════════

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
    public decimal Swaps { get; set; }
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
    // Additional properties for builder
    public string Direction { get; set; }
    public decimal AvgEntryPrice { get; set; }
    public decimal AvgExitPrice { get; set; }
    public double Duration { get; set; }
}

        static class TradeDtoBuilder
        {
            public static TradeDto BuildTradeDto(PositionState closedState)
            {
                var entries = closedState.Entries;
                var exits = closedState.Exits;

                var entryQty = entries.Sum(e => e.Qty);
                var exitQty = exits.Sum(e => e.Qty);
                var entryNotional = entries.Sum(e => e.Price * e.Qty);
                var exitNotional = exits.Sum(e => e.Price * e.Qty);

                var avgEntry = entryQty > 0 ? entryNotional / entryQty : 0;
                var avgExit = exits.Count > 0 ? exits.Sum(e => e.Price * e.Qty) / exits.Sum(e => e.Qty) : 0;

                var grossPnL = closedState.Exits.Sum(e => e.GrossPnL);
                var totalFees = exits.Sum(e => Math.Abs(e.Fee));
                var totalSwaps = exits.Sum(e => e.Swap);
                var netPnL = grossPnL - totalFees - totalSwaps;

                var directionSign = closedState.Direction == "LONG" ? 1 : -1;
                var calculatedGrossPnL = (avgExit - avgEntry) * closedState.Entries.Sum(e => e.Qty) * directionSign;

                var idInput = $"{closedState.AccountId}|{closedState.Symbol}|{closedState.OpenTime:O}|{closedState.ExitTime:O}|{closedState.FirstOrderId}";
                var platformTradeId = "qt_" + ComputeSHA1(idInput);

                var holdingSeconds = closedState.ExitTime.HasValue
                    ? (closedState.ExitTime.Value - closedState.OpenTime).TotalSeconds
                    : 0;

                return new TradeDto
                {
                    Id = closedState.PositionId,
                    Symbol = closedState.Symbol,
                    Side = closedState.Direction,
                    Quantity = closedState.Entries.Sum(e => e.Qty),
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
                    EntryCount = closedState.Entries.Count,
                    ExitCount = closedState.Exits.Count,
                    ScaleInCount = Math.Max(0, closedState.Entries.Count - 1),
                    PartialExitCount = Math.Max(0, closedState.Exits.Count - 1),
                    FillSequence = closedState.FillSequence,
                    AverageEntry = Math.Round(avgEntry, 6),
                    AverageExit = Math.Round(avgExit, 6),
                    Risk = 0,
                    Reward = 0,
                    HoldingSeconds = holdingSeconds,
                    MaxScaleIn = Math.Max(0, closedState.Entries.Count - 1),
                    FirstOrderId = closedState.FirstOrderId,
                    LastOrderId = closedState.LastOrderId,
                    FirstTradeId = closedState.FirstTradeId,
                    LastTradeId = closedState.LastTradeId,
                    Direction = closedState.Direction,
                    AvgEntryPrice = Math.Round(avgEntry, 6),
                    AvgExitPrice = Math.Round(avgExit, 6),
                    Duration = holdingSeconds
                };
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // HELPERS
        // ═══════════════════════════════════════════════════════════════

        private static DateTime GetTradingDay(Trade fill, string connectionId)
        {
            var conn = Core.Instance.Connections.Connected.FirstOrDefault(c => c.Id == connectionId);
            // Connection may not have TradingHours in some Quantower versions - fallback to UTC date
            var sessionStart = TimeSpan.Zero;
            try
            {
                var tradingHours = conn?.GetType().GetProperty("TradingHours")?.GetValue(conn);
                if (tradingHours != null)
                {
                    var sessionStartProp = tradingHours.GetType().GetProperty("SessionStart");
                    if (sessionStartProp != null)
                    {
                        sessionStart = (TimeSpan)sessionStartProp.GetValue(tradingHours);
                    }
                }
            }
            catch { }

            return fill.DateTime.TimeOfDay < sessionStart
                ? fill.DateTime.Date.AddDays(-1)
                : fill.DateTime.Date;
        }

        private static decimal NormalizeFee(decimal? raw)
        {
            var value = raw ?? 0m;
            return value > 0 ? -value : value;
        }

        private static string ComputeSHA1(string input)
        {
            using var sha1 = SHA1.Create();
            var hash = sha1.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(hash).Replace("-", "").ToLower();
        }
    }
}