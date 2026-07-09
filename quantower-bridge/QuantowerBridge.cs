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
//   4. Your webapp connects to http://localhost:8787
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
using System.Diagnostics.Metrics;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;

namespace QuantowerBridge
{
    // CORREÇÃO CS1520: O nome da classe deve ser exatamente igual ao do construtor
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

        // ── Lifecycle ──────────────────────────────────────
        protected override void OnCreated()
        {
            base.OnCreated();
        }

        protected override void OnRun()
        {
            try
            {
                _cts = new CancellationTokenSource();
                _listener = new HttpListener();

                string prefix = AllowExternal
                    ? $"http://+:{Port}/"
                    : $"http://localhost:{Port}/";

                _listener.Prefixes.Add(prefix);
                _listener.Start();

                Log($"✅ QuantowerBridge started on port {Port}", StrategyLoggingLevel.Trading);

                _serverThread = new Thread(ServerLoop)
                {
                    IsBackground = true,
                    Name = "QuantowerBridge-HTTP"
                };
                _serverThread.Start();
            }
            catch (Exception ex)
            {
                Log($"❌ Failed to start bridge: {ex.Message}", StrategyLoggingLevel.Error);
            }
        }

        protected override void OnStop()
        {
            try
            {
                _cts?.Cancel();
                _listener?.Stop();
                _listener?.Close();
                Log("🛑 QuantowerBridge stopped", StrategyLoggingLevel.Trading);
            }
            catch { }
        }

        protected override void OnInitializeMetrics(Meter meter)
        {
            base.OnInitializeMetrics(meter);

            meter.CreateObservableGauge(
                name: "Bridge Status",
                observeValue: () => _listener?.IsListening == true ? 1 : 0,
                description: "1 = 🟢 Online, 0 = 🔴 Offline"
            );

            meter.CreateObservableGauge(
                name: "Port",
                observeValue: () => Port,
                description: "HTTP Port do bridge"
            );
        }

        // ── HTTP Server Loop ───────────────────────────────
        private void ServerLoop()
        {
            while (!_cts.IsCancellationRequested && _listener.IsListening)
            {
                try
                {
                    var context = _listener.GetContext();
                    Task.Run(() => HandleRequest(context));
                }
                catch (HttpListenerException) { break; }
                catch (ObjectDisposedException) { break; }
                catch (Exception ex)
                {
                    Log($"⚠️ Request error: {ex.Message}", StrategyLoggingLevel.Error);
                }
            }
        }

        private void HandleRequest(HttpListenerContext context)
        {
            var response = context.Response;

            try
            {
                response.Headers.Add("Access-Control-Allow-Origin", "*");
                response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS");
                response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
                response.ContentType = "application/json; charset=utf-8";

                if (context.Request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 204;
                    response.Close();
                    return;
                }

                string path = context.Request.Url.AbsolutePath.ToLower().TrimEnd('/');
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
                        json = BuildTradesJson(context.Request.QueryString);
                        break;
                    case "/positions":
                        json = BuildPositionsJson();
                        break;
                    case "/orders":
                        json = BuildOrdersJson();
                        break;
                    default:
                        json = "{\"error\":\"Unknown endpoint\",\"endpoints\":[\"/status\",\"/accounts\",\"/trades\",\"/positions\",\"/orders\"]}";
                        response.StatusCode = 404;
                        break;
                }

                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentLength64 = buffer.Length;
                response.OutputStream.Write(buffer, 0, buffer.Length);
            }
            catch (Exception ex)
            {
                try
                {
                    byte[] err = Encoding.UTF8.GetBytes($"{{\"error\":\"{EscapeJson(ex.Message)}\"}}");
                    response.StatusCode = 500;
                    response.ContentLength64 = err.Length;
                    response.OutputStream.Write(err, 0, err.Length);
                }
                catch { }
            }
            finally
            {
                try { response.Close(); } catch { }
            }
        }

        // ── JSON Builders ──────────────────────────────────
        // AVISOS RESOLVIDOS: Métodos marcados como static e Count alterado para Length/propriedades diretas.

        private static string BuildStatusJson(int port)
        {
            var connections = Core.Instance.Connections.Connected
                .Select(c => $"{{\"id\":\"{EscapeJson(c.Id)}\",\"name\":\"{EscapeJson(c.Name)}\"}}")
                .ToArray();

            var tradesCount = Core.Instance.GetTrades(new TradesHistoryRequestParameters()).Count;

            return $"{{" +
                $"\"online\":true," +
                $"\"version\":\"1.0.0\"," +
                $"\"platform\":\"quantower\"," +
                $"\"port\":{port}," +
                $"\"timestamp\":\"{DateTime.UtcNow:O}\"," +
                $"\"connectionsCount\":{connections.Length}," +
                $"\"connections\":[{string.Join(",", connections)}]," +
                $"\"accountsCount\":{Core.Instance.Accounts.Length}," +
                $"\"positionsCount\":{Core.Instance.Positions.Length}," +
                $"\"tradesCount\":{tradesCount}" +
                $"}}";
        }

        private static string BuildAccountsJson()
        {
            var items = new List<string>();

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

                items.Add($"{{" +
                    $"\"id\":\"{EscapeJson(acc.Id)}\"," +
                    $"\"name\":\"{EscapeJson(acc.Name)}\"," +
                    $"\"balance\":{acc.Balance}," +
                    $"\"currency\":\"{EscapeJson(acc.AccountCurrency?.Name ?? "USD")}\"," +
                    $"\"connectionId\":\"{EscapeJson(acc.ConnectionId)}\"," +
                    $"\"connectionName\":\"{EscapeJson(connName)}\"" +
                    $"}}");
            }

            return $"{{\"accounts\":[{string.Join(",", items)}],\"count\":{items.Count},\"timestamp\":\"{DateTime.UtcNow:O}\"}}";
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
            var items = new List<string>();

            foreach (Trade trade in tradeList)
            {
                string connName = "";
                string accountId = "";
                string accountName = "";
                string symbol = "";
                string side = "";

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
                }
                catch { }

                items.Add($"{{" +
                    $"\"id\":\"{EscapeJson(trade.Id)}\"," +
                    $"\"symbol\":\"{EscapeJson(symbol)}\"," +
                    $"\"side\":\"{EscapeJson(side)}\"," +
                    $"\"quantity\":{trade.Quantity}," +
                    $"\"price\":{trade.Price}," +
                    $"\"dateTime\":\"{trade.DateTime:O}\"," +
                    $"\"grossPnl\":{trade.GrossPnl?.Value ?? 0}," +
                    $"\"netPnl\":{trade.NetPnl?.Value ?? 0}," +
                    $"\"fee\":{trade.Fee?.Value ?? 0}," +
                    $"\"orderId\":\"{EscapeJson(trade.OrderId ?? "")}\"," +
                    $"\"positionId\":\"{EscapeJson(trade.PositionId ?? "")}\"," +
                    $"\"accountId\":\"{EscapeJson(accountId)}\"," +
                    $"\"accountName\":\"{EscapeJson(accountName)}\"," +
                    $"\"connectionId\":\"{EscapeJson(trade.ConnectionId ?? "")}\"," +
                    $"\"connectionName\":\"{EscapeJson(connName)}\"" +
                    $"}}");
            }

            return $"{{\"trades\":[{string.Join(",", items)}],\"count\":{items.Count},\"timestamp\":\"{DateTime.UtcNow:O}\"}}";
        }

        private static string BuildPositionsJson()
        {
            var items = new List<string>();

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

                items.Add($"{{" +
                    $"\"id\":\"{EscapeJson(pos.Id)}\"," +
                    $"\"symbol\":\"{EscapeJson(symbol)}\"," +
                    $"\"side\":\"{EscapeJson(side)}\"," +
                    $"\"quantity\":{pos.Quantity}," +
                    $"\"openPrice\":{pos.OpenPrice}," +
                    $"\"currentPrice\":{pos.CurrentPrice}," +
                    $"\"openTime\":\"{pos.OpenTime:O}\"," +
                    $"\"grossPnl\":{pos.GrossPnL?.Value ?? 0}," +
                    $"\"netPnl\":{pos.NetPnL?.Value ?? 0}," +
                    $"\"fee\":{pos.Fee?.Value ?? 0}," +
                    $"\"accountId\":\"{EscapeJson(accountId)}\"," +
                    $"\"accountName\":\"{EscapeJson(accountName)}\"," +
                    $"\"connectionId\":\"{EscapeJson(pos.ConnectionId ?? "")}\"," +
                    $"\"connectionName\":\"{EscapeJson(connName)}\"," +
                    $"\"isLive\":true" +
                    $"}}");
            }

            return $"{{\"positions\":[{string.Join(",", items)}],\"count\":{items.Count},\"timestamp\":\"{DateTime.UtcNow:O}\"}}";
        }

        private static string BuildOrdersJson()
        {
            var items = new List<string>();

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

                items.Add($"{{" +
                    $"\"id\":\"{EscapeJson(order.Id)}\"," +
                    $"\"symbol\":\"{EscapeJson(symbol)}\"," +
                    $"\"side\":\"{EscapeJson(side)}\"," +
                    $"\"quantity\":{order.TotalQuantity}," +
                    $"\"price\":{order.Price}," +
                    $"\"connectionId\":\"{EscapeJson(order.ConnectionId ?? "")}\"," +
                    $"\"connectionName\":\"{EscapeJson(connName)}\"" +
                    $"}}");
            }

            return $"{{\"orders\":[{string.Join(",", items)}],\"count\":{items.Count},\"timestamp\":\"{DateTime.UtcNow:O}\"}}";
        }

        // ── Helpers ────────────────────────────────────────
        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\")
                    .Replace("\"", "\\\"")
                    .Replace("\n", "\\n")
                    .Replace("\r", "\\r")
                    .Replace("\t", "\\t");
        }
    }
}