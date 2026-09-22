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
using System.Collections.Concurrent;
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
        // [PATCH B] Amostra SL/TP das posições abertas para saber o stop ativo no fechamento.
        private System.Threading.Timer _slTpTimer;
        // [PATCH B] Handlers do Core para capturar SL/TP na abertura e no fechamento.
        private static Action<Position> _onPositionAdded;
        private static Action<Position> _onPositionRemoved;

        // ── Bridge v2: autenticação + idempotência ─────────────────────────
        // X-Bridge-Token em TODAS as rotas (04-BRIDGE_V2_SPEC.md). Token gerado
        // localmente (GUID) no primeiro run e salvo em arquivo ao lado do executável.
        // Nunca hardcoded no .cs, nunca no repo.
        private static string _bridgeToken;
        private static readonly string _tokenPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "QuantowerBridge", "token.txt");

        // Cache de idempotência: clientOrderId -> resposta JSON original (reenvio
        // retorna a mesma resposta sem reenviar a ordem pro Quantower).
        private static readonly ConcurrentDictionary<string, IdempotentEntry> _idempotency = new();
        private const int IdempotencyMaxEntries = 200;
        private static readonly TimeSpan IdempotencyTtl = TimeSpan.FromMinutes(10);
        private static readonly object _idempotencyLock = new();

        private static readonly string[] EndpointsList = new[] { "/status", "/accounts", "/trades", "/positions", "/orders", "/health", "/stream" };

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

                // ── Bridge v2: rotação manual de token ──────────────────────
                var args = Environment.GetCommandLineArgs();
                if (args.Any(a => string.Equals(a, "--rotate-token", StringComparison.OrdinalIgnoreCase)))
                {
                    string rotated = Guid.NewGuid().ToString("N");
                    File.WriteAllText(_tokenPath, rotated);
                    FileLog($"🔑 Token rotacionado (use-o no app para reparear).");
                    Log($"🔑 Bridge token rotacionado — repareie o app com o novo token.", StrategyLoggingLevel.Trading);
                    return;
                }

                // Carrega (ou gera) o token da bridge — nunca hardcoded.
                _bridgeToken = LoadOrCreateToken();
                FileLog($"🔑 Bridge token carregado (hash={TradeHelpers.ComputeSha1Hash(_bridgeToken).Substring(0, 8)}…).");

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

                // [PATCH B] Captura SL/TP no ciclo de vida da posição:
                //  - PositionAdded: registra o bracket inicial;
                //  - PositionRemoved: registra o bracket ATIVO no fechamento (o que importa p/ R).
                // O timer de 2s é só rede de segurança caso algum evento não dispare.
                if (_onPositionAdded == null)
                {
                    _onPositionAdded = pos => { try { PositionSlTpStore.Upsert(pos, false); } catch { /* noop */ } };
                    Core.Instance.PositionAdded += _onPositionAdded;
                }
                if (_onPositionRemoved == null)
                {
                    _onPositionRemoved = pos => { try { PositionSlTpStore.Upsert(pos, true); } catch { /* noop */ } };
                    Core.Instance.PositionRemoved += _onPositionRemoved;
                }
                _slTpTimer = new System.Threading.Timer(
                    _ => { try { PositionSlTpStore.Capture(); } catch { /* noop */ } },
                    null, 2000, 2000);

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
                _slTpTimer?.Dispose();
                // [PATCH B] Desassina os eventos do Core (evita handler duplicado em restart).
                if (_onPositionAdded != null) { Core.Instance.PositionAdded -= _onPositionAdded; _onPositionAdded = null; }
                if (_onPositionRemoved != null) { Core.Instance.PositionRemoved -= _onPositionRemoved; _onPositionRemoved = null; }
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

        // ── Bridge v2: token + idempotência helpers ─────────────────────────

        /// <summary>Carrega o token do arquivo de config ou gera um novo (GUID).</summary>
        private static string LoadOrCreateToken()
        {
            try
            {
                if (File.Exists(_tokenPath))
                {
                    string t = File.ReadAllText(_tokenPath).Trim();
                    if (!string.IsNullOrEmpty(t)) return t;
                }
                string newToken = Guid.NewGuid().ToString("N");
                Directory.CreateDirectory(Path.GetDirectoryName(_tokenPath));
                File.WriteAllText(_tokenPath, newToken);
                FileLog($"🔑 Token gerado e salvo em {_tokenPath}");
                return newToken;
            }
            catch (Exception ex)
            {
                FileLog($"⚠️ Não consegui salvar token: {ex.Message} — usando token efêmero");
                return Guid.NewGuid().ToString("N");
            }
        }

        /// <summary>Confere o header X-Bridge-Token contra o token atual.</summary>
        private static bool IsAuthorized(HttpListenerRequest request)
        {
            if (string.IsNullOrEmpty(_bridgeToken)) return false;
            string header = request.Headers["X-Bridge-Token"];
            if (!string.IsNullOrEmpty(header) && string.Equals(header.Trim(), _bridgeToken, StringComparison.Ordinal))
                return true;
            // SSE (EventSource) não permite header customizado → aceita o token na query.
            string q = request.QueryString["token"];
            return !string.IsNullOrEmpty(q) && string.Equals(q.Trim(), _bridgeToken, StringComparison.Ordinal);
        }

        /// <summary>Se clientOrderId já foi processado, retorna a resposta original (idempotência).</summary>
        private static bool TryGetIdempotent(string clientOrderId, out string json)
        {
            json = null;
            if (string.IsNullOrEmpty(clientOrderId)) return false;
            if (_idempotency.TryGetValue(clientOrderId, out var entry) &&
                (DateTime.UtcNow - entry.CreatedAt) <= IdempotencyTtl)
            {
                json = entry.ResponseJson;
                return true;
            }
            return false;
        }

        /// <summary>Guarda a resposta de um clientOrderId processado (com eviction).</summary>
        private static void RememberIdempotent(string clientOrderId, string responseJson)
        {
            if (string.IsNullOrEmpty(clientOrderId)) return;
            lock (_idempotencyLock)
            {
                if (_idempotency.Count >= IdempotencyMaxEntries)
                {
                    var oldest = _idempotency.OrderBy(kv => kv.Value.CreatedAt).First();
                    _idempotency.TryRemove(oldest.Key, out _);
                }
                _idempotency[clientOrderId] = new IdempotentEntry
                {
                    CreatedAt = DateTime.UtcNow,
                    ResponseJson = responseJson
                };
            }
        }

        private class IdempotentEntry
        {
            public DateTime CreatedAt;
            public string ResponseJson;
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

                // ── Bridge v2: autenticação em TODAS as rotas (sem exceção) ──
                // Inclusive /positions/close, que hoje não pede nada.
                if (!IsAuthorized(request))
                {
                    response.StatusCode = 401;
                    byte[] err = Encoding.UTF8.GetBytes(ErrorJson("invalid_token", "Token de bridge inválido ou ausente (header X-Bridge-Token).", false));
                    response.ContentLength64 = err.Length;
                    response.OutputStream.Write(err, 0, err.Length);
                    return;
                }

                string path = request.Url?.AbsolutePath?.ToLower().TrimEnd('/') ?? "";

                // [STREAM] SSE: conexão longa que empurra posições/ordens (~1.5s).
                // Tratada ANTES do switch (não escreve um JSON único e dá return).
                if (path == "/stream")
                {
                    HandleStream(response);
                    return;
                }

                // Normalize path - preserve v2 sub-rotas (open/modify/close/place/cancel).
                if (path == "/positions/open" || path == "/positions/modify" || path == "/positions/close")
                {
                    // keep as-is
                }
                else if (path.StartsWith("/positions")) path = "/positions";
                else if (path == "/orders/place" || path == "/orders/cancel")
                {
                    // keep as-is
                }
                else if (path.StartsWith("/orders")) path = "/orders";
                else if (path.StartsWith("/status")) path = "/status";
                else if (path.StartsWith("/accounts")) path = "/accounts";
                else if (path.StartsWith("/trades")) path = "/trades";
                else if (path.StartsWith("/health")) path = "/health";

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
                    case "/positions/open":
                        json = HandleOpenPosition(request);
                        break;
                    case "/positions/modify":
                        json = HandleModifyPosition(request);
                        break;
                    case "/orders/place":
                        json = HandlePlaceOrder(request);
                        break;
                    case "/orders/cancel":
                        json = HandleCancelOrder(request);
                        break;
                    case "/positions":
                        json = BuildPositionsJson();
                        break;
                    case "/orders":
                        json = BuildOrdersJson();
                        break;
                    case "/health":
                        json = BuildHealthJson();
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
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Token");
            response.Headers.Add("Access-Control-Max-Age", "86400");
            // 04-BRIDGE_V2_SPEC.md: removemos Access-Control-Allow-Private-Network.
            // Esse header opt-in permitia que uma página pública acessasse o bridge
            // na rede privada — reintroduzir só depois do token, se necessário.
        }

        // ── [STREAM] SSE: empurra posições/ordens enquanto o cliente estiver conectado ──
        private void HandleStream(HttpListenerResponse response)
        {
            response.StatusCode = 200;
            response.ContentType = "text/event-stream; charset=utf-8";
            response.Headers.Add("Cache-Control", "no-cache");
            response.Headers.Add("X-Accel-Buffering", "no");
            response.SendChunked = true;
            var writer = new StreamWriter(response.OutputStream, new UTF8Encoding(false));
            try
            {
                writer.Write("retry: 3000\n\n");
                writer.Flush();
                while (!_cts.IsCancellationRequested)
                {
                    writer.Write("data: " + BuildStreamPayload() + "\n\n");
                    writer.Flush();
                    Thread.Sleep(1500);
                }
            }
            catch { /* cliente desconectou (normal) */ }
            finally { try { writer.Dispose(); } catch { } }
        }

        private static string BuildStreamPayload()
        {
            try
            {
                using var pDoc = JsonDocument.Parse(BuildPositionsJson());
                using var oDoc = JsonDocument.Parse(BuildOrdersJson());
                var obj = new
                {
                    positions = pDoc.RootElement.GetProperty("positions"),
                    orders = oDoc.RootElement.GetProperty("orders"),
                    timestamp = DateTime.UtcNow.ToString("O")
                };
                return JsonSerializer.Serialize(obj, JsonOptions);
            }
            catch
            {
                return "{\"positions\":[],\"orders\":[],\"timestamp\":\"" + DateTime.UtcNow.ToString("O") + "\"}";
            }
        }

        private static string HandleClosePosition(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return ErrorJson("method_not_allowed", "Use POST.", false);

            var closeRequest = ReadJson<ClosePositionRequest>(request);
            if (closeRequest == null || string.IsNullOrEmpty(closeRequest.Id))
                return ErrorJson("position_not_found", "Missing required field: id", false);
            if (TryGetIdempotent(closeRequest.ClientOrderId, out string cached)) return cached;

            try
            {
                var position = Core.Instance.Positions.FirstOrDefault(p => p.Id == closeRequest.Id);
                if (position == null)
                    return ErrorJson("position_not_found", $"Position not found: {closeRequest.Id}", false);

                var result = position.Close();
                if (!IsSuccess(result))
                    return ErrorJson("unknown", result?.Message ?? "Falha ao fechar posição", true);

                string successMsg = $"Position {closeRequest.Id} closed successfully";
                FileLog($"[CLOSE] {successMsg}");
                string resp = JsonSerializer.Serialize(new { success = true, platformPositionId = closeRequest.Id, message = successMsg }, JsonOptions);
                RememberIdempotent(closeRequest.ClientOrderId, resp);
                return resp;
            }
            catch (Exception ex)
            {
                FileLog($"[CLOSE] Error: {ex.Message}");
                return ErrorJson("quantower_disconnected", ex.Message, true);
            }
        }

        // ── Bridge v2: /positions/open ──────────────────────────────────────
        private static string HandleOpenPosition(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return ErrorJson("method_not_allowed", "Use POST.", false);

            var req = ReadJson<OpenPositionRequest>(request);
            if (req == null || string.IsNullOrEmpty(req.AccountId) || string.IsNullOrEmpty(req.Symbol) || req.Qty <= 0)
                return ErrorJson("invalid_request", "Missing required field: accountId, symbol, side, qty, clientOrderId", false);
            if (TryGetIdempotent(req.ClientOrderId, out string cached)) return cached;

            try
            {
                var account = Core.Instance.Accounts.FirstOrDefault(a => a.Id == req.AccountId);
                if (account == null) return ErrorJson("position_not_found", $"Account not found: {req.AccountId}", false);
                var symbol = Core.Instance.Symbols.FirstOrDefault(s => s.Name == req.Symbol);
                if (symbol == null) return ErrorJson("symbol_closed", $"Symbol not found: {req.Symbol}", false);
                var side = string.Equals(req.Side, "sell", StringComparison.OrdinalIgnoreCase) ? Side.Sell : Side.Buy;

                var orderParams = new PlaceOrderRequestParameters
                {
                    Account = account,
                    Symbol = symbol,
                    Side = side,
                    Quantity = req.Qty,
                    TimeInForce = TimeInForce.Day,
                    OrderTypeId = OrderType.Market,
                    StopLoss = req.Sl.HasValue ? SlTpHolder.CreateSL(req.Sl.Value, PriceMeasurement.Absolute) : null,
                    TakeProfit = req.Tp.HasValue ? SlTpHolder.CreateSL(req.Tp.Value, PriceMeasurement.Absolute) : null
                };
                var result = Core.Instance.PlaceOrder(orderParams);
                if (!IsSuccess(result))
                    return ErrorJson("unknown", result?.Message ?? "Falha ao abrir posição", true);

                string positionId = req.ClientOrderId;
                string resp = JsonSerializer.Serialize(new { success = true, platformPositionId = positionId, filledPrice = symbol.Ask, filledQty = req.Qty }, JsonOptions);
                RememberIdempotent(req.ClientOrderId, resp);
                FileLog($"[OPEN] {req.Symbol} {side} {req.Qty} @ {account.Id}");
                return resp;
            }
            catch (Exception ex)
            {
                FileLog($"[OPEN] Error: {ex.Message}");
                return ErrorJson("quantower_disconnected", ex.Message, true);
            }
        }

        // ── Bridge v2: /positions/modify (SL/TP) ────────────────────────────
        private static string HandleModifyPosition(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return ErrorJson("method_not_allowed", "Use POST.", false);

            var req = ReadJson<ModifyPositionRequest>(request);
            if (req == null || string.IsNullOrEmpty(req.PlatformPositionId))
                return ErrorJson("position_not_found", "Missing required field: platformPositionId", false);
            if (TryGetIdempotent(req.ClientOrderId, out string cached)) return cached;

            try
            {
                var position = Core.Instance.Positions.FirstOrDefault(p => p.Id == req.PlatformPositionId);
                if (position == null)
                    return ErrorJson("position_not_found", $"Position not found: {req.PlatformPositionId}", false);

                if (req.Sl.HasValue)
                {
                    if (position.StopLoss != null)
                    {
                        var res = Core.Instance.ModifyOrder(position.StopLoss, price: req.Sl.Value);
                        if (!IsSuccess(res)) return ErrorJson("unknown", res?.Message ?? "Falha ao modificar SL", true);
                    }
                    else
                    {
                        // [PATCH A] A posição não tinha SL: o Quantower não expõe setter de
                        // SL/TP em Position, então criamos uma ordem Stop de fechamento
                        // (lado oposto, quantidade da posição) que atua como Stop Loss.
                        var res = Core.Instance.PlaceOrder(new PlaceOrderRequestParameters
                        {
                            Account = position.Account,
                            Symbol = position.Symbol,
                            Side = position.Side == Side.Buy ? Side.Sell : Side.Buy,
                            Quantity = position.Quantity,
                            OrderTypeId = OrderType.Stop,
                            TriggerPrice = req.Sl.Value,
                            TimeInForce = TimeInForce.GTC
                        });
                        if (!IsSuccess(res)) return ErrorJson("unknown", res?.Message ?? "Falha ao criar SL", true);
                    }
                }
                if (req.Tp.HasValue)
                {
                    if (position.TakeProfit != null)
                    {
                        var res = Core.Instance.ModifyOrder(position.TakeProfit, price: req.Tp.Value);
                        if (!IsSuccess(res)) return ErrorJson("unknown", res?.Message ?? "Falha ao modificar TP", true);
                    }
                    else
                    {
                        // [PATCH A] Idem SL: cria ordem Limit de fechamento como Take Profit.
                        var res = Core.Instance.PlaceOrder(new PlaceOrderRequestParameters
                        {
                            Account = position.Account,
                            Symbol = position.Symbol,
                            Side = position.Side == Side.Buy ? Side.Sell : Side.Buy,
                            Quantity = position.Quantity,
                            OrderTypeId = OrderType.Limit,
                            Price = req.Tp.Value,
                            TimeInForce = TimeInForce.GTC
                        });
                        if (!IsSuccess(res)) return ErrorJson("unknown", res?.Message ?? "Falha ao criar TP", true);
                    }
                }

                string resp = JsonSerializer.Serialize(new { success = true, platformPositionId = req.PlatformPositionId }, JsonOptions);
                RememberIdempotent(req.ClientOrderId, resp);
                FileLog($"[MODIFY] {req.PlatformPositionId} sl={req.Sl} tp={req.Tp}");
                return resp;
            }
            catch (Exception ex)
            {
                FileLog($"[MODIFY] Error: {ex.Message}");
                return ErrorJson("quantower_disconnected", ex.Message, true);
            }
        }

        // ── Bridge v2: /orders/place (limit/stop) ───────────────────────────
        private static string HandlePlaceOrder(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return ErrorJson("method_not_allowed", "Use POST.", false);

            var req = ReadJson<PlaceOrderRequest>(request);
            if (req == null || string.IsNullOrEmpty(req.AccountId) || string.IsNullOrEmpty(req.Symbol) || req.Qty <= 0)
                return ErrorJson("invalid_request", "Missing required field: accountId, symbol, side, qty, type, price, clientOrderId", false);
            if (TryGetIdempotent(req.ClientOrderId, out string cached)) return cached;

            try
            {
                var account = Core.Instance.Accounts.FirstOrDefault(a => a.Id == req.AccountId);
                if (account == null) return ErrorJson("position_not_found", $"Account not found: {req.AccountId}", false);
                var symbol = Core.Instance.Symbols.FirstOrDefault(s => s.Name == req.Symbol);
                if (symbol == null) return ErrorJson("symbol_closed", $"Symbol not found: {req.Symbol}", false);
                var side = string.Equals(req.Side, "sell", StringComparison.OrdinalIgnoreCase) ? Side.Sell : Side.Buy;
                bool isLimit = string.Equals(req.Type, "limit", StringComparison.OrdinalIgnoreCase);

                var orderParams = new PlaceOrderRequestParameters
                {
                    Account = account,
                    Symbol = symbol,
                    Side = side,
                    Quantity = req.Qty,
                    TimeInForce = TimeInForce.Day,
                    OrderTypeId = isLimit ? OrderType.Limit : OrderType.Stop,
                    Price = isLimit ? req.Price : -1,
                    TriggerPrice = isLimit ? -1 : req.Price,
                    StopLoss = req.Sl.HasValue ? SlTpHolder.CreateSL(req.Sl.Value, PriceMeasurement.Absolute) : null,
                    TakeProfit = req.Tp.HasValue ? SlTpHolder.CreateSL(req.Tp.Value, PriceMeasurement.Absolute) : null
                };
                var result = Core.Instance.PlaceOrder(orderParams);
                if (!IsSuccess(result))
                    return ErrorJson("unknown", result?.Message ?? "Falha ao colocar ordem", true);

                string resp = JsonSerializer.Serialize(new { success = true, platformOrderId = req.ClientOrderId }, JsonOptions);
                RememberIdempotent(req.ClientOrderId, resp);
                FileLog($"[ORDERS/PLACE] {req.Symbol} {side} {req.Qty} type={req.Type}");
                return resp;
            }
            catch (Exception ex)
            {
                FileLog($"[ORDERS/PLACE] Error: {ex.Message}");
                return ErrorJson("quantower_disconnected", ex.Message, true);
            }
        }

        // ── Bridge v2: /orders/cancel ───────────────────────────────────────
        private static string HandleCancelOrder(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return ErrorJson("method_not_allowed", "Use POST.", false);

            var req = ReadJson<CancelOrderRequest>(request);
            if (req == null || string.IsNullOrEmpty(req.PlatformOrderId))
                return ErrorJson("order_not_found", "Missing required field: platformOrderId", false);
            if (TryGetIdempotent(req.ClientOrderId, out string cached)) return cached;

            try
            {
                var order = Core.Instance.Orders.FirstOrDefault(o => o.Id == req.PlatformOrderId);
                if (order == null)
                    return ErrorJson("order_not_found", $"Order not found: {req.PlatformOrderId}", false);

                var result = order.Cancel();
                if (!IsSuccess(result))
                    return ErrorJson("unknown", result?.Message ?? "Falha ao cancelar ordem", true);

                string resp = JsonSerializer.Serialize(new { success = true }, JsonOptions);
                RememberIdempotent(req.ClientOrderId, resp);
                FileLog($"[ORDERS/CANCEL] {req.PlatformOrderId}");
                return resp;
            }
            catch (Exception ex)
            {
                FileLog($"[ORDERS/CANCEL] Error: {ex.Message}");
                return ErrorJson("quantower_disconnected", ex.Message, true);
            }
        }

        // ── Helpers de contrato de erro / JSON ──────────────────────────────
        private static bool IsSuccess(TradingOperationResult result)
        {
            return result != null &&
                string.Equals(result.Status.ToString(), "Success", StringComparison.OrdinalIgnoreCase);
        }

        private static string ErrorJson(string code, string message, bool retryable)
        {
            return JsonSerializer.Serialize(new
            {
                success = false,
                error = new { code, message, retryable }
            }, JsonOptions);
        }

        private static T ReadJson<T>(HttpListenerRequest request) where T : class
        {
            string body;
            using (var reader = new StreamReader(request.InputStream, request.ContentEncoding))
            {
                body = reader.ReadToEnd();
            }
            if (string.IsNullOrWhiteSpace(body)) return null;
            return JsonSerializer.Deserialize<T>(body, JsonOptions);
        }

        // ── Request DTOs (v2) ───────────────────────────────────────────────
        private class ClosePositionRequest
        {
            public string Id { get; set; }
            public string ClientOrderId { get; set; }
        }

        private class OpenPositionRequest
        {
            public string AccountId { get; set; }
            public string Symbol { get; set; }
            public string Side { get; set; }
            public double Qty { get; set; }
            public double? Sl { get; set; }
            public double? Tp { get; set; }
            public string Note { get; set; }
            public string ClientOrderId { get; set; }
        }

        private class ModifyPositionRequest
        {
            public string PlatformPositionId { get; set; }
            public double? Sl { get; set; }
            public double? Tp { get; set; }
            public string ClientOrderId { get; set; }
        }

        private class PlaceOrderRequest
        {
            public string AccountId { get; set; }
            public string Symbol { get; set; }
            public string Side { get; set; }
            public double Qty { get; set; }
            public string Type { get; set; }
            public double Price { get; set; }
            public double? Sl { get; set; }
            public double? Tp { get; set; }
            public string ClientOrderId { get; set; }
        }

        private class CancelOrderRequest
        {
            public string PlatformOrderId { get; set; }
            public string ClientOrderId { get; set; }
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
                version = BridgeVersion,
                build = BuildIdentifier,
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

        // ── Bridge v2: versão + build para o handshake do cliente ───────────
        // 2.1.0: contractSize (valor do ponto) no /trades; SL/TP persistidos em disco
        // (sobrevivem restart); fees somadas de entradas + saidas.
        private const string BridgeVersion = "2.1.0";
        // Prefixo usa a PRÓPRIA BridgeVersion (antes era "2.0.0-" hardcoded e confundia:
        // a ponte 2.1.0 aparecia com build "2.0.0-...").
        private static string BuildIdentifier =>
            $"{BridgeVersion}-{DateTime.UtcNow:yyyyMMddHHmm}";

        private static string BuildHealthJson()
        {
            return JsonSerializer.Serialize(new
            {
                status = "ok",
                timestamp = DateTime.UtcNow.ToString("O"),
                version = BridgeVersion
            }, JsonOptions);
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

            // Fills "externos" (trade aberto/fechado com o Quantower desligado) chegam do
            // histórico do broker SEM `GrossPnl` (0). Reconstrói o PnL em dinheiro antes de
            // serializar, senão o app grava resultado ≈ só a fee → mismatch saldo × trades.
            RepairMissingGross(allTrades);

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
                // Valor do PONTO (contract size) inferido: dinheiro / pontos. O app usa
                // para o R (e como fallback de PnL). Ver ComputeContractSize.
                contractSize = ComputeContractSize(t.GrossPnL, t.CalculatedGrossPnL, t.Quantity),
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
                stopPrice = t.StopPrice,
                takePrice = t.TakePrice,
                // [PATCH C] MAE/MFE em $ (excursão adversa/favorável sobre os fills).
                mae = t.Mae,
                mfe = t.Mfe,
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

        /**
         * VALOR DO PONTO (contract size / multiplier) do contrato.
         * A API do Quantower não expõe o multiplicador direto: ele sai da razão entre o
         * PnL em DINHEIRO que a plataforma calculou (`GrossPnl`) e o PnL em PONTOS do
         * nosso cálculo (`CalculatedGrossPnL` = (avgExit-avgEntry) * qty * sinal).
         * MNQ -> 2, MES -> 5, NQ -> 20, ES -> 50. Snap no inteiro próximo (1.9998 -> 2).
         * Retorna 0 quando não dá para inferir (o app deriva do mesmo jeito).
         */
        private static decimal ComputeContractSize(decimal grossPnl, decimal calculatedGrossPnL, decimal qty)
        {
            if (qty == 0 || Math.Abs(calculatedGrossPnL) < 0.0000001m) return 0m;
            var m = Math.Abs(grossPnl / calculatedGrossPnL);
            if (m <= 0) return 0m;
            var rounded = Math.Round(m);
            return Math.Abs(m - rounded) < 0.02m ? rounded : Math.Round(m, 4);
        }

        /**
         * Reconstrói o `GrossPnL` dos trades que a plataforma devolveu com gross = 0.
         * Acontece quando o fill veio do histórico do broker (posição aberta/fechada com o
         * Quantower fechado): o broker não calcula o PnL, então `fill.GrossPnl` vem 0 e o
         * `netPnl` calculado fica ≈ só a fee. Aqui inferimos o multiplicador do contrato
         * pelos outros trades do MESMO símbolo (que têm gross válido) e aplicamos sobre o
         * PnL em PONTOS (`CalculatedGrossPnL`), refazendo `GrossPnL` e `NetPnL`.
         *
         * Não toca em breakeven real (CalculatedGrossPnL == 0) nem em trade que já tem PnL.
         * Também NÃO mexe no `NetPnL` quando não há amostra de multiplicador (fica como veio).
         */
        private static void RepairMissingGross(List<TradeDto> trades)
        {
            // 1) Multiplicador inferido por símbolo (primeira amostra válida).
            var multiplierBySymbol = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in trades)
            {
                if (t.GrossPnL == 0 || t.CalculatedGrossPnL == 0) continue;
                var m = ComputeContractSize(t.GrossPnL, t.CalculatedGrossPnL, t.Quantity);
                if (m > 0 && !multiplierBySymbol.ContainsKey(t.Symbol)) multiplierBySymbol[t.Symbol] = m;
            }

            // 2) Aplica nos trades sem gross.
            foreach (var t in trades)
            {
                if (t.GrossPnL != 0) continue;          // já tem PnL da plataforma
                if (t.CalculatedGrossPnL == 0) continue; // sem movimento de preço (breakeven real)
                if (!multiplierBySymbol.TryGetValue(t.Symbol, out var m) || m <= 0) continue;

                var repairedGross = Math.Round(t.CalculatedGrossPnL * m, 2);
                t.GrossPnL = repairedGross;
                t.NetPnL = Math.Round(repairedGross - t.Fee - t.Swaps, 2);
                QuantowerBridge.FileLog($"[REPAIR] GrossPnl ausente (fill externo): Symbol={t.Symbol} Calculated={t.CalculatedGrossPnL:F2} Mult={m} => Gross={t.GrossPnL:F2} Net={t.NetPnL:F2}");
            }
        }

        private static string BuildPositionsJson()
        {
            // [PATCH B] Atualiza o registro de SL/TP a cada leitura de /positions.
            try { PositionSlTpStore.Capture(); } catch { /* noop */ }

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
                // Fee/Swap sao CUSTO: no fallback subtrai em modulo (a plataforma as vezes
                // reporta valor negativo e `gross + fee` aumentava o lucro).
                double netPnl = pos.NetPnL?.Value ?? (grossPnl - Math.Abs(fee) - Math.Abs(swaps));

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
                    // SL/TP atuais (usados pela tela de posições ao vivo). Null se não houver.
                    sl = pos.StopLoss != null ? (double?)pos.StopLoss.Price : null,
                    tp = pos.TakeProfit != null ? (double?)pos.TakeProfit.Price : null,
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
                string accountId = "";
                string accountName = "";

                try
                {
                    var conn = Core.Instance.Connections.Connected
                        .FirstOrDefault(c => c.Id == order.ConnectionId);
                    connName = conn?.Name ?? "";
                    symbol = order.Symbol?.Name ?? "";
                    side = order.Side.ToString();
                    if (order.Account != null)
                    {
                        accountId = order.Account.Id ?? "";
                        accountName = order.Account.Name ?? "";
                    }
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
                    accountId,
                    accountName,
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

        // [PATCH B] SL/TP capturados na abertura da posição (a Position pode não
        // existir mais quando a trade é reconstruída). Alimentam stopPrice/takePrice
        // do TradeDto para o app calcular R.
        public decimal? StopPrice, TakePrice;
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
    // [PATCH B] POSITION SL/TP STORE
    // Guarda o último SL/TP visto de cada posição aberta. Como o SL/TP pode
    // ser alterado durante a operação, o valor é amostrado continuamente
    // (timer de 2s + a cada /positions) e lido quando a trade fecha — assim o
    // R usa o stop realmente ativo no fechamento, e não o da abertura.
    // ═══════════════════════════════════════════════════════════════

    internal static class PositionSlTpStore
    {
        private sealed class Entry
        {
            public decimal? Sl, Tp;
            public DateTime SeenAt;
        }

        private static readonly object _lock = new();
        private static readonly Dictionary<string, Entry> _map = new();
        // [PERSIST] SL/TP sobrevivem a restart da strategy: sem isso, um trade fechado
        // depois de reiniciar o bridge ficava sem stop -> o app não conseguia o R.
        private static readonly string _storePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "QuantowerBridge", "sl-tp.json");
        private static bool _loaded;
        private static DateTime _lastSave = DateTime.MinValue;

        private sealed class PersistEntry
        {
            public decimal? Sl { get; set; }
            public decimal? Tp { get; set; }
            public DateTime SeenAt { get; set; }
        }

        private static void EnsureLoaded()
        {
            if (_loaded) return;
            _loaded = true;
            try
            {
                if (!File.Exists(_storePath)) return;
                var data = JsonSerializer.Deserialize<Dictionary<string, PersistEntry>>(File.ReadAllText(_storePath));
                if (data == null) return;
                lock (_lock)
                {
                    foreach (var kv in data)
                    {
                        if ((DateTime.UtcNow - kv.Value.SeenAt).TotalDays > 30) continue;
                        _map[kv.Key] = new Entry { Sl = kv.Value.Sl, Tp = kv.Value.Tp, SeenAt = kv.Value.SeenAt };
                    }
                }
            }
            catch { /* arquivo inválido: começa vazio */ }
        }

        private static void Save()
        {
            var now = DateTime.UtcNow;
            if ((now - _lastSave).TotalSeconds < 2) return; // I/O no máximo a cada 2s
            _lastSave = now;
            try
            {
                var dir = Path.GetDirectoryName(_storePath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                Dictionary<string, PersistEntry> data;
                lock (_lock)
                {
                    data = _map.ToDictionary(
                        kv => kv.Key,
                        kv => new PersistEntry { Sl = kv.Value.Sl, Tp = kv.Value.Tp, SeenAt = kv.Value.SeenAt });
                }
                File.WriteAllText(_storePath, JsonSerializer.Serialize(data));
            }
            catch { /* não crítico */ }
        }

        /** Amostra SL/TP das posições abertas. Limpa entradas não vistas há > 24h. */
        internal static void Capture()
        {
            EnsureLoaded();
            var now = DateTime.UtcNow;
            foreach (var pos in Core.Instance.Positions)
            {
                Upsert(pos, false);
            }

            if (_map.Count > 500)
            {
                lock (_lock)
                {
                    var stale = _map.Where(kv => (now - kv.Value.SeenAt).TotalHours > 24)
                                    .Select(kv => kv.Key).ToList();
                    foreach (var id in stale) _map.Remove(id);
                }
            }
            Save();
        }

        /**
         * Grava o SL/TP de UMA posição. Usado no evento PositionRemoved (fechamento):
         * assim o R usa o stop que estava ativo no fechamento, mesmo que o SL/TP tenha
         * sido movido durante a operação. `preserveOnNull` evita apagar um valor bom
         * quando a posição removida já vem sem os brackets.
         */
        internal static void Upsert(Position pos, bool preserveOnNull)
        {
            if (pos == null || string.IsNullOrEmpty(pos.Id)) return;
            EnsureLoaded();
            try
            {
                decimal? sl = pos.StopLoss != null ? (decimal)pos.StopLoss.Price : null;
                decimal? tp = pos.TakeProfit != null ? (decimal)pos.TakeProfit.Price : null;
                lock (_lock)
                {
                    if (preserveOnNull && _map.TryGetValue(pos.Id, out var prev))
                    {
                        sl = sl ?? prev.Sl;
                        tp = tp ?? prev.Tp;
                    }
                    _map[pos.Id] = new Entry { Sl = sl, Tp = tp, SeenAt = DateTime.UtcNow };
                }
                Save();
            }
            catch { /* posição/servidor instável — mantém o último valor */ }
        }

        internal static bool TryGet(string positionId, out decimal? sl, out decimal? tp)
        {
            sl = null;
            tp = null;
            if (string.IsNullOrEmpty(positionId)) return false;
            EnsureLoaded();
            lock (_lock)
            {
                if (_map.TryGetValue(positionId, out var e)) { sl = e.Sl; tp = e.Tp; return true; }
            }
            return false;
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

            // [PATCH B] Captura SL/TP vivos. Fallback: o valor autoritativo é lido
            // do PositionSlTpStore no fechamento (SL/TP podem mudar durante o trade).
            decimal? stopPrice = null;
            decimal? takePrice = null;
            try
            {
                var livePos = Core.Instance.Positions.FirstOrDefault(p => p.Id == fill.PositionId);
                if (livePos?.StopLoss != null) stopPrice = (decimal)livePos.StopLoss.Price;
                if (livePos?.TakeProfit != null) takePrice = (decimal)livePos.TakeProfit.Price;
            }
            catch { /* posição já encerrada — R fica n/a */ }

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
                LastTradeId = fill.Id,
                StopPrice = stopPrice,
                TakePrice = takePrice
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
        // [PATCH B] Stop/take por unidade (preço). O app usa stopPrice para calcular R.
        public decimal? StopPrice { get; set; }
        public decimal? TakePrice { get; set; }
        // [PATCH C] MAE/MFE reais em $ (excursão máxima adversa/favorável sobre os fills).
        // Mae <= 0, Mfe >= 0; null quando não há fills.
        public decimal? Mae { get; set; }
        public decimal? Mfe { get; set; }
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
            // [CORRIGIDO] Fees somadas de ENTRADAS + SAÍDAS e SEMPRE como CUSTO (Math.Abs):
            // algumas conexões reportam Fee/Swap NEGATIVOS, e aí `gross - fee` virava
            // `gross + |fee|` (o prejuízo ficava menor do que é). Fee é custo, sempre soma.
            var totalFees = entries.Sum(e => Math.Abs(e.Fee)) + exits.Sum(e => Math.Abs(e.Fee));
            var totalSwaps = entries.Sum(e => Math.Abs(e.Swap)) + exits.Sum(e => Math.Abs(e.Swap));
            var netPnL = grossPnL - totalFees - totalSwaps;

            var directionSign = closedState.Direction == "LONG" ? 1 : -1;
            var calculatedGrossPnL = (avgExit - avgEntry) * entryQty * directionSign;

            // [PATCH C] MAE/MFE em $: excursão sobre TODOS os fills (entradas + saídas),
            // medida a partir do preço médio de entrada, na direção do trade. Mesma
            // convenção do proxy do app (`maeMfe`): Mfe >= 0, Mae <= 0. Null sem fills.
            decimal? mae = null;
            decimal? mfe = null;
            if (entryQty > 0 && closedState.AllFills.Count > 0)
            {
                decimal maxFav = 0m, maxAdv = 0m;
                foreach (var f in closedState.AllFills)
                {
                    var signed = (f.Price - avgEntry) * directionSign * entryQty;
                    if (signed > maxFav) maxFav = signed;
                    if (signed < maxAdv) maxAdv = signed;
                }
                mfe = Math.Round(maxFav, 2);
                mae = Math.Round(maxAdv, 2);
            }

            var idInput = $"{closedState.AccountId}|{closedState.Symbol}|{closedState.OpenTime:O}|{closedState.ExitTime:O}|{closedState.FirstOrderId}";
            var platformTradeId = "qt_" + TradeHelpers.ComputeSha1Hash(idInput);

            var holdingSeconds = closedState.ExitTime.HasValue
                ? (closedState.ExitTime.Value - closedState.OpenTime).TotalSeconds
                : 0;

            // [PATCH B] SL/TP ativos no fechamento (registro contínuo). Sobrepõe o
            // valor capturado na abertura, pois o usuário pode ter movido o SL/TP.
            decimal? stopPrice = closedState.StopPrice;
            decimal? takePrice = closedState.TakePrice;
            if (PositionSlTpStore.TryGet(closedState.PositionId, out var regSl, out var regTp))
            {
                stopPrice = regSl;
                takePrice = regTp;
            }

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
                StopPrice = stopPrice,
                TakePrice = takePrice,
                Mae = mae,
                Mfe = mfe,
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