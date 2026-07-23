// ============================================================
// QuantowerBridge — Local HTTP Bridge for Web Integration
// ============================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Diagnostics;
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
        public QuantowerBridge()
        {
            Name = "QuantowerBridge";
            Description = "Bridge de integração via HTTP API";
        }

        // ── Configuration ──────────────────────────────────
        [InputParameter("HTTP Port", 10)]
        public int Port = 8787;

        [InputParameter("Allow External Access", 20)]
        public bool AllowExternal = false;

        private HttpListener _listener;
        private CancellationTokenSource _cts;
        private Thread _serverThread;

        private static readonly string[] EndpointsList = ["/status", "/accounts", "/trades", "/positions", "/orders", "/health"];

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            WriteIndented = false,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals
        };

        // ── Lifecycle ──────────────────────────────────────
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

        private static string _logPath;
        private static readonly Lock _logLock = new();
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

        public static void FileLog(string message)
        {
            try
            {
                string line = $"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}";
                lock (_logLock) { File.AppendAllText(LogPath, line); }
            }
            catch { }
        }

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
                SetCorsHeaders(response);
                response.ContentType = "application/json; charset=utf-8";

                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 204;
                    response.Close();
                    return;
                }

                string path = request.Url?.AbsolutePath?.ToLower().TrimEnd('/') ?? "";

                if (path.StartsWith("/status")) path = "/status";
                else if (path.StartsWith("/accounts")) path = "/accounts";
                else if (path.StartsWith("/trades")) path = "/trades";
                else if (path == "/positions" || path == "/positions/close") { }
                else if (path.StartsWith("/positions")) path = "/positions";
                else if (path.StartsWith("/orders")) path = "/orders";

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

        private static string BuildStatusJson(int port)
        {
            var connections = Core.Instance.Connections.Connected
                .Select(c => new { c.Id, c.Name })
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
            List<object> accounts = [];

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
                    acc.Id,
                    acc.Name,
                    acc.Balance,
                    currency = acc.AccountCurrency?.Name ?? "USD",
                    acc.ConnectionId,
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

        private static List<TradeDto> ReconstructTrades(
            List<(Trade Fill, DateTime TradingDay)> fills,
            Dictionary<string, Connection> connections)
        {
            List<TradeDto> trades = [];
            var current = new PositionState();
            int fillSequence = 0;

            foreach (var (fill, tradingDay) in fills)
            {
                fillSequence++;

                if (current.HasEntries && current.PositionId != fill.PositionId)
                {
                    FileLog($"[RECON] WARNING: PositionId changed mid-trade: was={current.PositionId} now={fill.PositionId} Symbol={fill.Symbol?.Name}");
                }

                var (nextState, closedTrades) = ApplyFill(current, fill, tradingDay, connections, fillSequence);

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

        private static (PositionState, List<TradeDto>) ApplyFill(
            PositionState current,
            Trade fill,
            DateTime tradingDay,
            Dictionary<string, Connection> connections,
            int sequence)
        {
            List<TradeDto> closedTrades = [];
            var isBuy = fill.Side == Side.Buy;
            var qty = (decimal)fill.Quantity;
            var price = (decimal)fill.Price;
            var time = fill.DateTime;

            if (current.NetQty == 0)
            {
                var fresh = StartNewPosition(fill, tradingDay, connections);
                fresh = AddEntryFill(fresh, qty, price, time, sequence, fill.OrderId, fill.Id);
                fresh.NetQty = isBuy ? qty : -qty;
                return (fresh, closedTrades);
            }

            var oldNetQty = current.NetQty;
            bool positionIsLong = oldNetQty > 0;
            bool fillReducesPosition = positionIsLong ? !isBuy : isBuy;

            current.LastOrderId = fill.OrderId;
            current.LastTradeId = fill.Id;

            if (!fillReducesPosition)
            {
                var scaled = AddEntryFill(current, qty, price, time, sequence, fill.OrderId, fill.Id);
                scaled.NetQty += isBuy ? qty : -qty;
                return (scaled, closedTrades);
            }

            var closeQty = Math.Min(Math.Abs(oldNetQty), qty);
            var remainingQty = qty - closeQty;

            var fee = TradeDtoBuilder.NormalizeFee((decimal?)fill.Fee?.Value);
            var swap = 0m;
            var grossPnL = 0m;

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
                if (current.HasEntries)
                {
                    closedTrades.Add(TradeDtoBuilder.BuildTradeDto(current));
                }

                if (remainingQty > 0)
                {
                    var reversed = StartNewPosition(fill, tradingDay, connections);
                    reversed.Direction = isBuy ? "LONG" : "SHORT";
                    reversed = AddEntryFill(reversed, remainingQty, price, time, sequence, fill.OrderId, fill.Id);
                    reversed.NetQty = isBuy ? remainingQty : -remainingQty;

                    FileLog($"[RECON] REVERSÃO: Symbol={fill.Symbol?.Name} Closed={current.Direction} New={reversed.Direction} RemainingQty={remainingQty}");
                    return (reversed, closedTrades);
                }

                return (new PositionState(), closedTrades);
            }

            return (current, closedTrades);
        }

        private static PositionState StartNewPosition(Trade fill, DateTime tradingDay, Dictionary<string, Connection> connections)
        {
            var isBuy = fill.Side == Side.Buy;
            return new PositionState
            {
                Direction = isBuy ? "LONG" : "SHORT",
                OpenTime = fill.DateTime,
                AccountId = fill.Account?.Id ?? "",
                AccountName = fill.Account?.Name ?? "",
                PositionId = fill.PositionId,
                ConnectionId = fill.ConnectionId ?? "",
                ConnectionName = connections.GetValueOrDefault(fill.ConnectionId)?.Name ?? "",
                TradingDay = tradingDay,
                FirstOrderId = fill.OrderId,
                LastOrderId = fill.OrderId,
                FirstTradeId = fill.Id,
                LastTradeId = fill.Id
            };
        }

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

            var fillsWithDay = allFills.Select(f => (
                Fill: f,
                TradingDay: TradeDtoBuilder.GetTradingDay(f)
            )).ToList();

            var groups = fillsWithDay
                .GroupBy(x => new
                {
                    AccountId = x.Fill.Account?.Id ?? "",
                    Symbol = x.Fill.Symbol?.Name ?? ""
                });

            List<TradeDto> allTrades = [];
            var connections = Core.Instance.Connections.Connected.ToDictionary(c => c.Id);

            foreach (var group in groups)
            {
                var fillsWithDayInGroup = group.OrderBy(x => x.Fill.DateTime)
                                                .ThenBy(x => x.Fill.OrderId)
                                                .ThenBy(x => x.Fill.Id)
                                                .ToList();

                var trades = ReconstructTrades(fillsWithDayInGroup, connections);
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
                lastTradeId = t.LastTradeId,
                calculatedGrossPnL = t.CalculatedGrossPnL
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
            List<object> positions = [];

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
                    grossPnl,
                    netPnl,
                    fee,
                    swaps,
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
            List<object> orders = [];

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
                    status = order.State.ToString()
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

    // ════════════════════════════════════════════════════════════════
    // DTOs & HELPERS 
    // ════════════════════════════════════════════════════════════════

    public class FillData
    {
        public decimal Qty, Price;
        public DateTime Time;
        public decimal Fee, Swap, GrossPnL;
        public bool IsExit;
        public int Sequence;
        public string OrderId, TradeId;
    }

    public class PositionState
    {
        public string Symbol, AccountId, AccountName, PositionId, ConnectionId, ConnectionName;
        public string Direction = "";
        public DateTime OpenTime;
        public DateTime? ExitTime;
        public DateTime TradingDay;
        public decimal NetQty = 0;

        public List<FillData> Entries = [];
        public List<FillData> Exits = [];
        public List<FillData> AllFills = [];

        public int FillSequence = 0;
        public bool HasEntries => Entries.Count > 0;
        public string FirstOrderId, LastOrderId, FirstTradeId, LastTradeId;
    }

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
        public decimal NetPnL { get; set; }
        public decimal Fee { get; set; }
        public decimal Swaps { get; set; }
        public string Direction { get; set; }
        public decimal AvgEntryPrice { get; set; }
        public decimal AvgExitPrice { get; set; }
        public double Duration { get; set; }
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
        public decimal CalculatedGrossPnL { get; set; }
    }

    public static class TradeDtoBuilder
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
            var avgExit = exitQty > 0 ? exitNotional / exitQty : 0;

            var grossPnL = exits.Sum(e => e.GrossPnL);
            var totalFees = exits.Sum(e => Math.Abs(e.Fee));
            var totalSwaps = exits.Sum(e => e.Swap);
            var netPnL = grossPnL - totalFees - totalSwaps;

            var directionSign = closedState.Direction == "LONG" ? 1 : -1;
            var calculatedGrossPnL = (avgExit - avgEntry) * entryQty * directionSign;

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
                Direction = closedState.Direction,
                AvgEntryPrice = Math.Round(avgEntry, 6),
                AvgExitPrice = Math.Round(avgExit, 6),
                Duration = holdingSeconds,
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

        public static DateTime GetTradingDay(Trade fill)
        {
            return fill.DateTime.Date;
        }

        public static decimal NormalizeFee(decimal? raw)
        {
            var value = raw ?? 0m;
            return value > 0 ? -value : value;
        }

        public static string ComputeSHA1(string input)
        {
            byte[] hash = SHA1.HashData(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexStringLower(hash);
        }
    }
}