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
//
// ============================================================
// ALTERAÇÕES EM RELAÇÃO À VERSÃO ANTERIOR:
//
// [1] REMOVIDO: OnGetMetrics() — método obsoleto no SDK atual do Quantower.
//     O compilador avisava: "Strategy.OnGetMetrics() is obsolete:
//     Use OnInitializeMetrics() method to initialize System.Diagnostics.Metrics"
//
// [2] ADICIONADO: OnInitializeMetrics(Meter meter) — novo padrão do .NET
//     para métricas observáveis. Em vez de retornar uma lista estática,
//     registramos gauges que o Quantower consulta dinamicamente.
//
// [3] ADICIONADO: using System.Diagnostics.Metrics — necessário para o
//     tipo Meter usado em OnInitializeMetrics.
//
// [4] CORRIGIDO: Parsing de datas em BuildTradesJson — o operador ternário
//     inline após TryParse não é válido em C#. Separado em blocos if/else
//     corretos para fromDate e toDate.
//
// [5] CORRIGIDO: Core.Instance.Trades não existe na API do Quantower.
//     Conforme documentação oficial (api.quantower.com/docs/...Core.html),
//     trades são obtidos via Core.Instance.GetTrades(TradesHistoryRequestParameters).
//     Corrigido em dois locais:
//       - BuildStatusJson: contagem de trades no status
//       - BuildTradesJson: iteração sobre os trades com filtro de datas
//
// [6] CORRIGIDO: TradesH



istoryRequestParameters.FromTime e .ToTime não existem.
//     Conforme docs (api.quantower.com/docs/...TradesHistoryRequestParameters.html),
//     as propriedades corretas são From (DateTime) e To (DateTime).
// ============================================================

using System;
using System.Collections.Generic;
using System.Diagnostics.Metrics; // [3] ADICIONADO: necessário para o tipo Meter
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using TradingPlatform.BusinessLayer;

namespace QuantowerBridge
{
    public class BridgeStrategy : Strategy
    {
        // ── Configuration ──────────────────────────────────
        [InputParameter("HTTP Port", 10)]
        public int Port = 8787;

        [InputParameter("Allow External Access", 20)]
        public bool AllowExternal = false;

        private HttpListener _listener;
        private CancellationTokenSource _cts;
        private Thread _serverThread;

        // ── Lifecycle ──────────────────────────────────────
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

        // [1] REMOVIDO: OnGetMetrics() — era o método obsoleto:
        //     protected override List<StrategyMetric> OnGetMetrics() { ... }
        //
        // [2] ADICIONADO: OnInitializeMetrics — novo padrão do SDK.
        //     Usa System.Diagnostics.Metrics.Meter para registrar gauges
        //     observáveis que o Quantower lê dinamicamente.
        protected override void OnInitializeMetrics(Meter meter)
        {
            base.OnInitializeMetrics(meter);

            // Gauge de status: retorna 1 se online, 0 se offline
            meter.CreateObservableGauge(
                name: "Bridge Status",
                observeValue: () => _listener?.IsListening == true ? 1 : 0,
                description: "1 = 🟢 Online, 0 = 🔴 Offline"
            );

            // Gauge da porta configurada
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
                // CORS headers for webapp access
                response.Headers.Add("Access-Control-Allow-Origin", "*");
                response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS");
                response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
                response.ContentType = "application/json; charset=utf-8";

                // Handle CORS preflight
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
                        json = BuildStatusJson();
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

        private string BuildStatusJson()
        {
            var connections = Core.Instance.Connections.Connected
                .Select(c => $"{{\"id\":\"{EscapeJson(c.Id)}\",\"name\":\"{EscapeJson(c.Name)}\"}}")
                .ToList();

            return $"{{" +
                $"\"online\":true," +
                $"\"version\":\"1.0.0\"," +
                $"\"platform\":\"quantower\"," +
                $"\"port\":{Port}," +
                $"\"timestamp\":\"{DateTime.UtcNow:O}\"," +
                $"\"connectionsCount\":{connections.Count}," +
                $"\"connections\":[{string.Join(",", connections)}]," +
                // [5] CORRIGIDO: Core não tem propriedade Trades — usar GetTrades()
                $"\"accountsCount\":{Core.Instance.Accounts.Count()}," +
                $"\"positionsCount\":{Core.Instance.Positions.Count()}," +
                $"\"tradesCount\":{Core.Instance.GetTrades(new TradesHistoryRequestParameters()).Count}" +
                $"}}";
        }

        private string BuildAccountsJson()
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

        private string BuildTradesJson(System.Collections.Specialized.NameValueCollection query)
        {
            // [4] CORRIGIDO: o parsing de datas estava usando operador ternário inline
            //     após TryParse, que não é sintaxe válida em C#. Separado em if/else.
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

            // [5] CORRIGIDO: Core não tem propriedade Trades — usar GetTrades()
            //     com TradesHistoryRequestParameters passando o intervalo de datas.
            // Propriedades corretas conforme docs: From e To (não FromTime/ToTime)
            var reqParams = new TradesHistoryRequestParameters
            {
                From = fromDate ?? DateTime.UtcNow.AddYears(-10),
                To   = toDate   ?? DateTime.UtcNow
            };

            var tradeList = Core.Instance.GetTrades(reqParams);
            var items = new List<string>();

            foreach (Trade trade in tradeList)
            {
                // Filtro de datas já aplicado via TradesHistoryRequestParameters acima
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

        private string BuildPositionsJson()
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

        private string BuildOrdersJson()
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