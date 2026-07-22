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

        private static string BuildTradesJson(System.Collections.Specialized.NameValueCollection query)
        {
            DateTime? fromDate = null;
            DateTime? toDate = null;

            if (!string.IsNullOrEmpty(query["from"]))
                if (DateTime.TryParse(query["from"], out DateTime f)) fromDate = f;

            if (!string.IsNullOrEmpty(query["to"]))
                if (DateTime.TryParse(query["to"], out DateTime t)) toDate = t;

            var reqParams = new TradesHistoryRequestParameters
            {
                From = fromDate ?? DateTime.UtcNow.AddDays(-1),
                To = toDate ?? DateTime.UtcNow
            };
            var tradeList = Core.Instance.GetTrades(reqParams);

            var grouped = tradeList
                .Where(t => !string.IsNullOrEmpty(t.PositionId))
                .GroupBy(t => t.PositionId);

            var trades = new List<object>();

            foreach (var group in grouped)
            {
                var fillList = group.ToList();

                bool isLong = fillList.First().Side == Side.Buy;
                var entries = fillList.Where(t => t.Side == (isLong ? Side.Buy : Side.Sell)).ToList();
                var exits = fillList.Where(t => t.Side == (isLong ? Side.Sell : Side.Buy)).ToList();

                // Posição ainda aberta → aparece em /positions
                if (entries.Count == 0 || exits.Count == 0)
                {
                    FileLog($"[TRADES] Skip open position {group.Key}: entries={entries.Count}, exits={exits.Count}");
                    continue;
                }

                Trade firstTrade = group.First();
                string connName = "";
                string accountId = "";
                string accountName = "";

                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == firstTrade.ConnectionId);
                    connName = conn?.Name ?? "";
                    accountId = firstTrade.Account?.Id ?? "";
                    accountName = firstTrade.Account?.Name ?? "";
                    FileLog($"[TRADES] Group {group.Key}: accountId={accountId}, entries={entries.Count}, exits={exits.Count}");
                }
                catch (Exception ex)
                {
                    FileLog($"[TRADES] Error getting account for group {group.Key}: {ex.Message}");
                }

                double totalQty = (double)entries.Sum(t => (double)t.Quantity);
                double totalFee = (double)group.Sum(t => t.Fee?.Value ?? 0);
                double grossPnl = (double)exits.Sum(t => t.GrossPnl?.Value ?? 0);
                double netPnl = (double)exits.Sum(t => t.NetPnl?.Value ?? 0);
                if (netPnl == 0 && grossPnl != 0) netPnl = grossPnl;

                double entryPrice = entries.Count > 0
                    ? (double)entries.Sum(t => (double)t.Price * (double)t.Quantity)
                      / (double)entries.Sum(t => (double)t.Quantity)
                    : 0;
                double exitPrice = exits.Count > 0
                    ? (double)exits.Sum(t => (double)t.Price * (double)t.Quantity)
                      / (double)exits.Sum(t => (double)t.Quantity)
                    : 0;

                DateTime entryTime = entries.Count > 0 ? entries.Min(t => t.DateTime) : group.Min(t => t.DateTime);
                DateTime exitTime = exits.Count > 0 ? exits.Max(t => t.DateTime) : entryTime;

                trades.Add(new
                {
                    id = group.Key,
                    symbol = firstTrade.Symbol?.Name ?? "",
                    side = isLong ? "Long" : "Short",
                    quantity = totalQty,
                    entryPrice = Math.Round(entryPrice, 6),
                    exitPrice = Math.Round(exitPrice, 6),
                    entryDateTime = entryTime.ToString("O"),
                    exitDateTime = exitTime.ToString("O"),
                    grossPnl = Math.Round(grossPnl, 2),
                    netPnl = Math.Round(netPnl, 2),
                    fee = Math.Round(totalFee, 2),
                    positionId = group.Key,
                    accountId,
                    accountName,
                    connectionId = firstTrade.ConnectionId ?? "",
                    connectionName = connName
                });
            }

            // ── Fills sem PositionId (raro) ────────────────────────────────────────
            var ungrouped = tradeList.Where(t => string.IsNullOrEmpty(t.PositionId));
            foreach (Trade trade in ungrouped)
            {
                string connName = "";
                string accId = "";
                string accName = "";
                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == trade.ConnectionId);
                    connName = conn?.Name ?? "";
                    accId = trade.Account?.Id ?? "";
                    accName = trade.Account?.Name ?? "";
                }
                catch (Exception ex)
                {
                    FileLog($"[TRADES] Error getting account for ungrouped {trade.Id}: {ex.Message}");
                }

                double fillGross = trade.GrossPnl?.Value ?? 0;
                double fillNet = trade.NetPnl?.Value ?? fillGross;
                bool isExitFill = fillNet != 0 || fillGross != 0;

                trades.Add(new
                {
                    id = trade.Id,
                    symbol = trade.Symbol?.Name ?? "",
                    side = trade.Side.ToString(),
                    quantity = (double)trade.Quantity,
                    entryPrice = (double)trade.Price,
                    exitPrice = isExitFill ? (double)trade.Price : (double)0,
                    entryDateTime = trade.DateTime.ToString("O"),
                    exitDateTime = isExitFill ? trade.DateTime.ToString("O") : null,
                    grossPnl = fillGross,
                    netPnl = fillNet,
                    fee = trade.Fee?.Value ?? 0,
                    positionId = "",
                    accountId = accId,
                    accountName = accName,
                    connectionId = trade.ConnectionId ?? "",
                    connectionName = connName
                });
            }

            return JsonSerializer.Serialize(new
            {
                trades,
                count = trades.Count,
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
                double netPnl = pos.NetPnL?.Value ?? grossPnl;

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
                    fee = pos.Fee?.Value ?? 0,
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
    }
}