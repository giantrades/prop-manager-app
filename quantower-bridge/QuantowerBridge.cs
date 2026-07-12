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
                    TryReserveUrlAcl(Port);

                    started = TryStartListener($"http://*:{Port}/");
                    
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
                // Check if already reserved
                var check = Process.Start(new ProcessStartInfo
                {
                    FileName = "netsh.exe",
                    Arguments = $"http show urlacl url=http://+:{port}/",
                    Verb = "runas",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
                check?.WaitForExit(2000);

                if (check?.ExitCode != 0)
                {
                    // Reserve URL ACL for Everyone (allows non-admin to bind)
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
            FileLog("ServerLoop started");
            while (!_cts.IsCancellationRequested && _listener.IsListening)
            {
                try
                {
                    var context = _listener.GetContext();
                    Task.Run(() => HandleRequest(context));
                }
                catch (HttpListenerException ex)
                {
                    FileLog($"ServerLoop HttpListenerException: {ex.Message} (code={ex.ErrorCode})");
                    break;
                }
                catch (ObjectDisposedException ex)
                {
                    FileLog($"ServerLoop ObjectDisposedException: {ex.Message}");
                    break;
                }
                catch (Exception ex)
                {
                    string em = $"⚠️ ServerLoop error: {ex}";
                    Log(em, StrategyLoggingLevel.Error);
                    FileLog(em);
                }
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
                else if (path.StartsWith("/positions")) path = "/positions";
                else if (path.StartsWith("/orders")) path = "/orders";

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
            response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization");
            response.Headers.Add("Access-Control-Max-Age", "86400");
            response.Headers.Add("Access-Control-Allow-Private-Network", "true");
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
            {
                if (DateTime.TryParse(query["from"], out DateTime f))
                    fromDate = f;
            }

            if (!string.IsNullOrEmpty(query["to"]))
            {
                if (DateTime.TryParse(query["to"], out DateTime t))
                    toDate = t;
            }

            var reqParams = new TradesHistoryRequestParameters
            {
                From = fromDate ?? DateTime.UtcNow.AddYears(-10),
                To = toDate ?? DateTime.UtcNow
            };

            var tradeList = Core.Instance.GetTrades(reqParams);
            var trades = new List<object>();

            foreach (Trade trade in tradeList)
            {
                string connName = "";
                string accountId = "";
                string accountName = "";
                string symbol = "";
                string side = "";
                string positionId = "";

                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == trade.ConnectionId);
                    connName = conn?.Name ?? "";

                    symbol = trade.Symbol?.Name ?? "";
                    side = trade.Side.ToString();

                    if (trade.Account != null)
                    {
                        accountId = trade.Account.Id ?? "";
                        accountName = trade.Account.Name ?? "";
                    }
                    
                    positionId = trade.PositionId ?? "";
                }
                catch { }

                trades.Add(new
                {
                    id = trade.Id,
                    symbol,
                    side,
                    quantity = trade.Quantity,
                    price = trade.Price,
                    dateTime = trade.DateTime.ToString("O"),
                    grossPnl = trade.GrossPnl?.Value ?? 0,
                    netPnl = trade.NetPnl?.Value ?? 0,
                    fee = trade.Fee?.Value ?? 0,
                    orderId = trade.OrderId ?? "",
                    positionId = trade.PositionId ?? "",
                    accountId,
                    accountName,
                    connectionId = trade.ConnectionId ?? "",
                    connectionName = connName
                });
            }

            var result = new
            {
                trades,
                count = trades.Count,
                timestamp = DateTime.UtcNow.ToString("O")
            };

            return JsonSerializer.Serialize(result, JsonOptions);
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
                }
                catch { }

                positions.Add(new
                {
                    id = pos.Id,
                    symbol,
                    side,
                    quantity = pos.Quantity,
                    openPrice = pos.OpenPrice,
                    currentPrice = pos.CurrentPrice,
                    openTime = pos.OpenTime.ToString("O"),
                    grossPnl = pos.GrossPnL?.Value ?? 0,
                    netPnl = pos.NetPnL?.Value ?? 0,
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