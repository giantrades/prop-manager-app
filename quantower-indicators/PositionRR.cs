// ============================================================
// PositionRR â€” Quantower Indicator (C#)
// ============================================================
// Desenha no grafico, para cada posicao aberta do simbolo:
//   - linha do STOP LOSS com o valor em R e em dinheiro (-1.00R / -$X)
//   - linha do TAKE PROFIT com o R (relativo ao stop) e o dinheiro (+2.50R / +$Y)
//   - linha do ENTRY
//   - marcador NOW no preco atual (R flutuante vs. stop + P&L em $)
//
// Fonte dos dados: Core.Instance.Positions (todas as contas e conexoes).
// O valor em $ usa o GrossPnL calculado pelo proprio broker (multiplicador,
// contract size e conversao de moeda ja embutidos). O multiplicador so e
// inferido/sintetizado quando o preco ainda esta exatamente no entry.
// ============================================================

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using TradingPlatform.BusinessLayer;
using TradingPlatform.BusinessLayer.Chart;

namespace PositionRR
{
    public class PositionRRIndicator : Indicator
    {
        [InputParameter("Draw price lines on chart", 10)]
        public bool DrawPriceLines = false;

        [InputParameter("Panel corner", 15, variants: new object[]{
            "Top Left", 0,
            "Top Right", 1,
            "Bottom Left", 2,
            "Bottom Right", 3
        })]
        public int PanelCorner = 1;

        [InputParameter("Show panel header", 16)]
        public bool ShowPanelHeader = false;

        [InputParameter("Show floating NOW label", 20)]
        public bool ShowNow = true;

        [InputParameter("Show account name on labels", 40)]
        public bool ShowAccount = true;

        [InputParameter("R basis", 35, variants: new object[]{
            "Initial stop (recommended)", 0,
            "Current stop (trailing)", 1
        })]
        public int RStopBasis = 0;

        [InputParameter("Show initial SL reference", 45)]
        public bool ShowInitialSl = true;

        [InputParameter("Font size", 50, 6, 24, 1, 0)]
        public int FontSize = 7;

        [InputParameter("Panel margin (px)", 55, 0, 200, 1, 0)]
        public int PanelMargin = 10;

        [InputParameter("Money per 1.0 price / 1 unit (0 = auto)", 60, 0, 10000000, 0.1, 4)]
        public double ManualMultiplier = 0;

        [InputParameter("Currency symbol override (empty = auto)", 70)]
        public string CurrencySymbol = "";

        private static readonly Dictionary<string, double> MultiplierCache =
            new Dictionary<string, double>(StringComparer.Ordinal);
        private static readonly object CacheLock = new object();

        // Guarda o stop INICIAL de cada posicao (o "1R" de verdade). O stop atual
        // pode ir para BE/lucro; o R do TP e do NOW continua ancorado aqui.
        private static readonly Dictionary<string, double> InitialStopCache =
            new Dictionary<string, double>(StringComparer.Ordinal);
        private static readonly object InitialStopLock = new object();

        private Font _font;
        private bool _subscribed;
        private Action<Position> _onPositionAdded;
        private Action<Position> _onPositionRemoved;
        private Action<Order> _onOrderAdded;
        private Action<Order> _onOrderRemoved;
        private DateTime _lastRedraw = DateTime.MinValue;

        public PositionRRIndicator() : base()
        {
            Name = "Position R:R (R + $)";
            Description = "Mostra R e valor em dinheiro no SL, no TP e no preco atual de cada posicao aberta (qualquer conta/conexao).";
            SeparateWindow = false;
            AllowFitAuto = false;
            OnBackGround = false;
        }

        protected override void OnInit()
        {
            ResetFont();
            if (_subscribed) return;
            try
            {
                _onPositionAdded = p => SafeRedraw();
                _onPositionRemoved = p => SafeRedraw();
                _onOrderAdded = o => SafeRedraw();
                _onOrderRemoved = o => SafeRedraw();
                Core.Instance.PositionAdded += _onPositionAdded;
                Core.Instance.PositionRemoved += _onPositionRemoved;
                Core.Instance.OrderAdded += _onOrderAdded;
                Core.Instance.OrderRemoved += _onOrderRemoved;
                _subscribed = true;
            }
            catch
            {
                // Core pode nao estar pronto no primeiro ciclo; OnUpdate ainda redesenha.
            }
        }

        protected override void OnSettingsUpdated()
        {
            base.OnSettingsUpdated();
            ResetFont();
        }

        protected override void OnClear()
        {
            if (_subscribed)
            {
                try { Core.Instance.PositionAdded -= _onPositionAdded; } catch { }
                try { Core.Instance.PositionRemoved -= _onPositionRemoved; } catch { }
                try { Core.Instance.OrderAdded -= _onOrderAdded; } catch { }
                try { Core.Instance.OrderRemoved -= _onOrderRemoved; } catch { }
                _subscribed = false;
                _onPositionAdded = null;
                _onPositionRemoved = null;
                _onOrderAdded = null;
                _onOrderRemoved = null;
            }
            ResetFont();
        }

        protected override void OnUpdate(UpdateArgs args)
        {
            var now = DateTime.UtcNow;
            if ((now - _lastRedraw).TotalMilliseconds < 250.0) return;
            _lastRedraw = now;
            SafeRedraw();
        }

        public override void OnPaintChart(PaintChartEventArgs args)
        {
            base.OnPaintChart(args);

            var chart = CurrentChart;
            if (chart == null || Symbol == null) return;

            var windows = chart.Windows;
            if (windows == null || args.WindowIndex < 0 || args.WindowIndex >= windows.Length) return;
            var window = windows[args.WindowIndex];
            if (window == null) return;

            var converter = window.CoordinatesConverter;
            if (converter == null) return;

            var items = new List<PosData>();
            try
            {
                var allPositions = Core.Instance.Positions;
                if (allPositions != null)
                {
                    foreach (var p in allPositions)
                    {
                        if (p == null || p.Symbol == null) continue;
                        if (!string.Equals(p.Symbol.Name, Symbol.Name, StringComparison.OrdinalIgnoreCase)) continue;
                        if (Math.Abs(p.Quantity) < double.Epsilon) continue;
                        var pd = BuildPositionData(p);
                        if (pd != null) items.Add(pd);
                    }
                }

                var allOrders = Core.Instance.Orders;
                if (allOrders != null)
                {
                    foreach (var o in allOrders)
                    {
                        var od = BuildPendingData(o);
                        if (od != null) items.Add(od);
                    }
                }
            }
            catch { return; }

            if (items.Count == 0) return;

            var gr = args.Graphics;
            var rect = window.ClientRectangle;
            if (rect.Width <= 0 || rect.Height <= 0) return;

            var font = GetFont();
            var state = gr.Save();
            var oldSmoothing = gr.SmoothingMode;
            var oldText = gr.TextRenderingHint;
            try
            {
                gr.SetClip(rect);
                gr.SmoothingMode = SmoothingMode.AntiAlias;
                gr.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                bool multiple = items.Count > 1;

                if (DrawPriceLines)
                {
                    for (int i = 0; i < items.Count; i++)
                    {
                        var d = items[i];
                        if (d.Entry <= 0) continue;

                        AddLine(gr, rect, converter, d.Entry, Color.FromArgb(130, 180, 180, 180), DashStyle.Dot, 1f);

                        if (!double.IsNaN(d.Sl))
                            AddLine(gr, rect, converter, d.Sl, Color.FromArgb(150, 255, 90, 100), DashStyle.Dot, 1f);

                        if (!double.IsNaN(d.Tp))
                            AddLine(gr, rect, converter, d.Tp, Color.FromArgb(150, 80, 210, 120), DashStyle.Dot, 1f);

                        if (ShowInitialSl && RStopBasis == 0 && !double.IsNaN(d.RStop) &&
                            (double.IsNaN(d.Sl) || Math.Abs(d.RStop - d.Sl) > 1e-9))
                            AddLine(gr, rect, converter, d.RStop, Color.FromArgb(90, 255, 130, 140), DashStyle.Dash, 1f);

                        if (ShowNow && d.HasCurrent)
                            AddLine(gr, rect, converter, d.Current, Color.FromArgb(90, 120, 190, 255), DashStyle.Dot, 1f);
                    }
                }

                DrawHud(gr, rect, font, BuildHudRows(items, multiple));
            }
            finally
            {
                gr.SmoothingMode = oldSmoothing;
                gr.TextRenderingHint = oldText;
                gr.Restore(state);
            }
        }

        private sealed class HudRow
        {
            public string Text;
            public Color Color;
        }

        private List<HudRow> BuildHudRows(List<PosData> items, bool multiple)
        {
            var rows = new List<HudRow>();
            if (ShowPanelHeader)
                rows.Add(new HudRow { Text = "R:R  " + Symbol.Name, Color = Color.FromArgb(185, 185, 190) });

            for (int i = 0; i < items.Count; i++)
            {
                var d = items[i];
                if (d.Entry <= 0) continue;

                string prefix = multiple ? "#" + (i + 1) + " " : "";
                string kind = d.IsPending ? "ORD" : "POS";
                string side = d.IsBuy ? "BUY" : "SELL";
                string account = ShowAccount ? ShortAccount(d.Account) : "";

                string title = prefix + kind + " " + side + " " + FormatQty(d.Qty) +
                               " @ " + FormatPriceText(d.Entry);
                if (account.Length > 0) title += "  " + account;
                rows.Add(new HudRow { Text = title, Color = Color.FromArgb(230, 230, 230) });

                if (!double.IsNaN(d.Sl))
                {
                    string rSl = d.RiskMoney > 0 ? FormatR(d.MoneyAtSl / d.RiskMoney) : "R n/a";
                    rows.Add(new HudRow
                    {
                        Text = "  SL " + FormatPriceText(d.Sl) + "  " + rSl + "  " + SignedMoney(d.MoneyAtSl, d.CurrencyCode),
                        Color = Color.FromArgb(255, 110, 120)
                    });
                }

                if (!double.IsNaN(d.Tp))
                {
                    string rTp = d.RiskMoney > 0 ? FormatR(d.MoneyAtTp / d.RiskMoney) : "R n/a";
                    rows.Add(new HudRow
                    {
                        Text = "  TP " + FormatPriceText(d.Tp) + "  " + rTp + "  " + SignedMoney(d.MoneyAtTp, d.CurrencyCode),
                        Color = Color.FromArgb(95, 225, 140)
                    });
                }

                if (ShowNow && d.HasCurrent)
                {
                    double pnl = MoneyAt(d, d.Current);
                    string rNow = d.RiskMoney > 0 ? FormatR(pnl / d.RiskMoney) : "R n/a";
                    string text = "  NOW " + FormatPriceText(d.Current) + "  " + rNow + "  " + SignedMoney(pnl, d.CurrencyCode);
                    if (double.IsNaN(d.Sl)) text += "   (sem SL)";
                    rows.Add(new HudRow { Text = text, Color = Color.FromArgb(140, 205, 255) });
                }
            }

            return rows;
        }

        private void DrawHud(Graphics gr, Rectangle rect, Font font, List<HudRow> rows)
        {
            if (rows == null || rows.Count == 0) return;

            const float padding = 5f;
            float lineHeight = font.GetHeight(gr) + 1f;
            float maxWidth = 0f;

            foreach (var row in rows)
            {
                if (string.IsNullOrEmpty(row.Text)) continue;
                var size = gr.MeasureString(row.Text, font);
                if (size.Width > maxWidth) maxWidth = size.Width;
            }

            if (maxWidth <= 0f) return;

            float width = maxWidth + padding * 2f;
            float height = rows.Count * lineHeight + padding * 2f;

            if (width > rect.Width - 4f) width = rect.Width - 4f;
            if (height > rect.Height - 4f) height = rect.Height - 4f;

            float margin = PanelMargin;
            float x = (PanelCorner == 1 || PanelCorner == 3) ? rect.Right - width - margin : rect.Left + margin;
            float y = (PanelCorner == 2 || PanelCorner == 3) ? rect.Bottom - height - margin : rect.Top + margin;

            if (x < rect.Left + 2f) x = rect.Left + 2f;
            if (y < rect.Top + 2f) y = rect.Top + 2f;
            if (x + width > rect.Right - 2f) x = rect.Right - width - 2f;
            if (y + height > rect.Bottom - 2f) y = rect.Bottom - height - 2f;

            using (var background = new SolidBrush(Color.FromArgb(215, 16, 18, 22)))
            using (var border = new Pen(Color.FromArgb(130, 95, 95, 105), 1f))
            {
                gr.FillRectangle(background, x, y, width, height);
                gr.DrawRectangle(border, x, y, width, height);
            }

            float textY = y + padding;
            foreach (var row in rows)
            {
                if (!string.IsNullOrEmpty(row.Text))
                {
                    using (var brush = new SolidBrush(row.Color))
                        gr.DrawString(row.Text, font, brush, x + padding, textY);
                }
                textY += lineHeight;
            }
        }

        private sealed class PosData
        {
            public double Entry;
            public double Current;
            public double Qty;
            public double Sl = double.NaN;
            public double Tp = double.NaN;
            public bool IsBuy;
            public double GrossPnl;
            public double Multiplier;
            public string Account;
            public string CurrencyCode;
            public double MoneyAtSl;
            public double MoneyAtTp;
            public double RStop = double.NaN;
            public double MoneyAtRStop;
            public double RiskMoney;
            public bool HasCurrent;
            public bool IsPending;
        }

        private PosData BuildPositionData(Position pos)
        {
            var d = new PosData
            {
                Entry = pos.OpenPrice,
                Current = pos.CurrentPrice > 0 ? pos.CurrentPrice : pos.OpenPrice,
                HasCurrent = pos.CurrentPrice > 0,
                Qty = Math.Abs(pos.Quantity),
                IsBuy = string.Equals(pos.Side.ToString(), "Buy", StringComparison.OrdinalIgnoreCase),
                GrossPnl = pos.GrossPnL?.Value ?? 0.0,
                Account = pos.Account?.Name ?? ""
            };

            try
            {
                var slOrder = pos.StopLoss;
                if (slOrder != null)
                {
                    double sl = slOrder.Price;
                    if (!(sl > 0)) sl = slOrder.TriggerPrice;
                    if (sl > 0 && !double.IsNaN(sl) && !double.IsInfinity(sl)) d.Sl = sl;
                }

                var tpOrder = pos.TakeProfit;
                if (tpOrder != null)
                {
                    double tp = tpOrder.Price;
                    if (!(tp > 0)) tp = tpOrder.TriggerPrice;
                    if (tp > 0 && !double.IsNaN(tp) && !double.IsInfinity(tp)) d.Tp = tp;
                }
            }
            catch
            {
                // Algumas conexoes nao expoem SL/TP como Order; segue sem eles.
            }

            d.Multiplier = ResolveMoneyMultiplier(pos.Account, CacheKey(pos), d, out string positionCurrency);
            d.CurrencyCode = positionCurrency;
            d.RStop = RStopBasis == 0 ? ResolveInitialStop(pos, d) : d.Sl;
            d.MoneyAtSl = MoneyAt(d, d.Sl);
            d.MoneyAtTp = MoneyAt(d, d.Tp);
            d.MoneyAtRStop = MoneyAt(d, d.RStop);
            d.RiskMoney = double.IsNaN(d.RStop) ? 0.0 : Math.Abs(d.MoneyAtRStop);
            return d;
        }

        private double ResolveInitialStop(Position pos, PosData d)
        {
            string key = PositionKey(pos);
            double dir = d.IsBuy ? 1.0 : -1.0;

            lock (InitialStopLock)
            {
                double cached;
                if (InitialStopCache.TryGetValue(key, out cached)) return cached;

                // So memoriza se o stop ainda esta do lado de risco (abaixo da
                // entrada no long / acima no short). Se o indicador foi aberto
                // depois que o stop ja tinha ido para BE/lucro, nao ha como saber
                // o stop original: cai no stop atual.
                if (!double.IsNaN(d.Sl))
                {
                    double riskDistance = (d.Entry - d.Sl) * dir;
                    if (riskDistance > 0)
                    {
                        InitialStopCache[key] = d.Sl;
                        return d.Sl;
                    }
                }
            }

            return d.Sl;
        }

        private static string PositionKey(Position pos)
        {
            string baseKey = (pos.ConnectionId ?? "") + "|" + (pos.Account?.Id ?? "") + "|" +
                             (pos.Symbol?.Name ?? "");

            if (pos.OpenTime != DateTime.MinValue)
                return baseKey + "|" + pos.OpenTime.Ticks.ToString(CultureInfo.InvariantCulture);

            return baseKey + "|" + (pos.Id ?? "");
        }

        private PosData BuildPendingData(Order order)
        {
            if (order == null || order.Symbol == null) return null;
            if (!string.Equals(order.Symbol.Name, Symbol.Name, StringComparison.OrdinalIgnoreCase)) return null;
            if (!IsWorkingOrder(order)) return null;

            double entry = EntryPriceFor(order);
            if (!(entry > 0)) return null;

            string side = order.Side.ToString();
            bool isBuy = string.Equals(side, "Buy", StringComparison.OrdinalIgnoreCase);
            if (!isBuy && !string.Equals(side, "Sell", StringComparison.OrdinalIgnoreCase)) return null;

            // Le os SL/TP pendurados na ordem (antes do fill). Usa reflection
            // para suportar variacoes de versao da API e PriceMeasurement.
            double sl = HolderPrice(order.StopLoss, entry, isBuy, true);
            double tp = HolderPrice(order.TakeProfit, entry, isBuy, false);
            if (double.IsNaN(sl) && double.IsNaN(tp)) return null;

            double qty = Math.Abs(order.TotalQuantity);
            if (!(qty > 0)) qty = Math.Abs(order.RemainingQuantity);
            if (!(qty > 0)) return null;

            var d = new PosData
            {
                IsPending = true,
                Entry = entry,
                Current = entry,
                HasCurrent = false,
                Qty = qty,
                IsBuy = isBuy,
                GrossPnl = 0.0,
                Account = order.Account?.Name ?? "",
                Sl = sl,
                Tp = tp
            };

            d.Multiplier = ResolveMoneyMultiplier(
                order.Account,
                MultiplierKey(order.ConnectionId, order.Account?.Id, order.Symbol?.Name),
                d, out string orderCurrency);
            d.CurrencyCode = orderCurrency;
            d.RStop = d.Sl;
            d.MoneyAtSl = MoneyAt(d, d.Sl);
            d.MoneyAtTp = MoneyAt(d, d.Tp);
            d.MoneyAtRStop = d.MoneyAtSl;
            d.RiskMoney = double.IsNaN(d.RStop) ? 0.0 : Math.Abs(d.MoneyAtRStop);
            return d;
        }

        private static bool IsWorkingOrder(Order order)
        {
            try
            {
                string status = order.Status.ToString();
                if (status.Equals("Filled", StringComparison.OrdinalIgnoreCase)) return false;
                if (status.IndexOf("Cancel", StringComparison.OrdinalIgnoreCase) >= 0) return false;
                if (status.IndexOf("Reject", StringComparison.OrdinalIgnoreCase) >= 0) return false;
                if (status.IndexOf("Expire", StringComparison.OrdinalIgnoreCase) >= 0) return false;
                if (status.IndexOf("Removed", StringComparison.OrdinalIgnoreCase) >= 0) return false;
                if (status.IndexOf("Inactive", StringComparison.OrdinalIgnoreCase) >= 0) return false;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private double EntryPriceFor(Order order)
        {
            try
            {
                if (order.Price > 0 && !double.IsNaN(order.Price) && !double.IsInfinity(order.Price))
                    return order.Price;
                if (order.TriggerPrice > 0 && !double.IsNaN(order.TriggerPrice) && !double.IsInfinity(order.TriggerPrice))
                    return order.TriggerPrice;
            }
            catch
            {
                // conexao sem preco no book
            }

            try
            {
                if (Symbol.Last > 0) return Symbol.Last;
                if (Symbol.Bid > 0) return Symbol.Bid;
                if (Symbol.Ask > 0) return Symbol.Ask;
            }
            catch
            {
                // sem quote
            }

            return 0.0;
        }

        private double HolderPrice(SlTpHolder holder, double entry, bool isBuy, bool isStopLoss)
        {
            if (holder == null) return double.NaN;

            try
            {
                double raw = holder.Price;
                if (!(raw > 0) || double.IsNaN(raw) || double.IsInfinity(raw)) return double.NaN;

                bool isOffset = holder.PriceMeasurement == PriceMeasurement.Offset;
                if (!isOffset) return raw;

                // No Quantower, PriceMeasurement.Offset e medido em TICKS.
                double tick = 0.0;
                try { tick = Symbol.TickSize; } catch { }
                if (tick > 0 && !double.IsNaN(tick) && !double.IsInfinity(tick))
                    return entry + SideSign(isBuy, isStopLoss) * raw * tick;

                return entry + SideSign(isBuy, isStopLoss) * raw;
            }
            catch
            {
                return double.NaN;
            }
        }

        private static double SideSign(bool isBuy, bool isStopLoss)
        {
            if (isStopLoss) return isBuy ? -1.0 : 1.0;
            return isBuy ? 1.0 : -1.0;
        }

        private double MoneyAt(PosData d, double price)
        {
            if (double.IsNaN(price)) return double.NaN;
            if (!(d.Multiplier > 0)) return double.NaN;

            double dir = d.IsBuy ? 1.0 : -1.0;
            return (price - d.Entry) * dir * d.Qty * d.Multiplier;
        }

        private double ResolveMoneyMultiplier(Account account, string key, PosData d, out string currencyCode)
        {
            currencyCode = QuoteCurrencyCode();

            if (ManualMultiplier > 0) return ManualMultiplier;

            bool sameCurrency = SameCurrency(account);

            if (sameCurrency)
            {
                double derived = ResolveMultiplier(key, d.Entry, d.Current, d.IsBuy, d.Qty, d.GrossPnl);
                if (derived > 0) return derived;
            }
            else
            {
                double quoteMultiplier = ResolveQuoteMultiplier(account, key, d);
                if (quoteMultiplier > 0) return quoteMultiplier;
            }

            double stable = ResolveStableMultiplier();
            if (stable > 0) return stable;

            double fallback = ResolveMultiplier(key, d.Entry, d.Current, d.IsBuy, d.Qty, d.GrossPnl);
            if (fallback > 0)
            {
                if (!sameCurrency) currencyCode = AccountCurrencyCode(account);
                return fallback;
            }

            return 1.0;
        }

        private double ResolveQuoteMultiplier(Account account, string key, PosData d)
        {
            lock (CacheLock)
            {
                double cached;
                if (MultiplierCache.TryGetValue(key, out cached) && cached > 0) return cached;
            }

            double tick = 0.0;
            try { tick = Symbol.TickSize; } catch { }
            double minMove = (tick > 0 && !double.IsNaN(tick) && !double.IsInfinity(tick))
                ? tick * 2.0
                : 1e-9;

            if (Math.Abs(d.Current - d.Entry) < minMove || Math.Abs(d.GrossPnl) < 1e-9)
                return 0.0;

            double raw = DeriveMultiplier(d.Entry, d.Current, d.IsBuy, d.Qty, d.GrossPnl);
            if (!(raw > 0)) return 0.0;

            double rate = QuotePerAccountRate(account);
            if (!(rate > 0)) return 0.0;

            double quoteMultiplier = NormalizeMultiplier(raw * rate);
            if (!(quoteMultiplier > 0)) return 0.0;

            lock (CacheLock) { MultiplierCache[key] = quoteMultiplier; }
            return quoteMultiplier;
        }

        private static double DeriveMultiplier(double entry, double current, bool isBuy, double qty, double gross)
        {
            if (qty <= 0 || Math.Abs(gross) < 1e-9) return 0.0;

            double dir = isBuy ? 1.0 : -1.0;
            double den = (current - entry) * dir * qty;
            if (Math.Abs(den) < 1e-12) return 0.0;

            double multiplier = gross / den;
            return multiplier > 0 && !double.IsNaN(multiplier) && !double.IsInfinity(multiplier)
                ? multiplier
                : 0.0;
        }

        private double QuotePerAccountRate(Account account)
        {
            string accountCode = AccountCurrencyCode(account);
            string quoteCode = QuoteCurrencyCode();

            if (string.IsNullOrWhiteSpace(accountCode) || string.IsNullOrWhiteSpace(quoteCode))
                return 1.0;
            if (string.Equals(accountCode, quoteCode, StringComparison.OrdinalIgnoreCase))
                return 1.0;

            try
            {
                var symbols = Core.Instance?.Symbols;
                if (symbols == null) return 0.0;

                // Par direto: moeda da conta -> moeda de cotacao.
                foreach (var s in symbols)
                {
                    if (s == null) continue;
                    if (!string.Equals(s.Product?.IsoCode, accountCode, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!string.Equals(s.QuotingCurrency?.IsoCode, quoteCode, StringComparison.OrdinalIgnoreCase)) continue;

                    double price = s.Last > 0 ? s.Last : s.Mark;
                    if (price > 0 && !double.IsNaN(price) && !double.IsInfinity(price))
                        return price;
                }

                // Par inverso: moeda de cotacao -> moeda da conta.
                foreach (var s in symbols)
                {
                    if (s == null) continue;
                    if (!string.Equals(s.Product?.IsoCode, quoteCode, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!string.Equals(s.QuotingCurrency?.IsoCode, accountCode, StringComparison.OrdinalIgnoreCase)) continue;

                    double price = s.Last > 0 ? s.Last : s.Mark;
                    if (price > 0 && !double.IsNaN(price) && !double.IsInfinity(price))
                        return 1.0 / price;
                }
            }
            catch
            {
                // sem par de conversao disponivel
            }

            return 0.0;
        }

        private bool SameCurrency(Account account)
        {
            try
            {
                string accountCode = account?.AccountCurrency?.IsoCode;
                string quoteCode = Symbol?.QuotingCurrency?.IsoCode;
                if (string.IsNullOrWhiteSpace(accountCode) || string.IsNullOrWhiteSpace(quoteCode)) return true;
                return string.Equals(accountCode, quoteCode, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return true;
            }
        }

        private string QuoteCurrencyCode()
        {
            try { return Symbol?.QuotingCurrency?.IsoCode ?? ""; }
            catch { return ""; }
        }

        private static string AccountCurrencyCode(Account account)
        {
            try { return account?.AccountCurrency?.IsoCode ?? ""; }
            catch { return ""; }
        }

        private double ResolveStableMultiplier()
        {
            double value;

            if (TrySymbolAdditionalNumber("ContractSize", out value) && value > 0)
                return NormalizeMultiplier(value);
            if (TrySymbolAdditionalNumber("Multiplier", out value) && value > 0)
                return NormalizeMultiplier(value);
            if (TrySymbolAdditionalNumber("PointValue", out value) && value > 0)
                return NormalizeMultiplier(value);

            double tick = 0.0;
            try { tick = Symbol.TickSize; } catch { }
            if (tick > 0 && !double.IsNaN(tick) && !double.IsInfinity(tick))
            {
                if (TrySymbolAdditionalNumber("TickValue", out value) && value > 0)
                    return NormalizeMultiplier(value / tick);
                if (TrySymbolAdditionalNumber("TickCost", out value) && value > 0)
                    return NormalizeMultiplier(value / tick);
            }

            double lot = 0.0;
            try { lot = Symbol.LotSize; } catch { }
            if (lot > 0 && !double.IsNaN(lot) && !double.IsInfinity(lot))
                return NormalizeMultiplier(lot);

            return 0.0;
        }

        private bool TrySymbolAdditionalNumber(string key, out double value)
        {
            value = 0.0;
            try
            {
                var info = Symbol?.AdditionalInfo;
                if (info == null) return false;

                AdditionalInfoItem item;
                if (!info.TryGetItem(key, out item) || item == null || item.Value == null) return false;

                value = Convert.ToDouble(item.Value, CultureInfo.InvariantCulture);
                return !double.IsNaN(value) && !double.IsInfinity(value);
            }
            catch
            {
                return false;
            }
        }

        private double ResolveMultiplier(string key, double entry, double current, bool isBuy, double qty, double gross)
        {
            if (ManualMultiplier > 0) return ManualMultiplier;

            try
            {
                double dir = isBuy ? 1.0 : -1.0;
                double den = (current - entry) * dir * qty;
                double tick = 0.0;
                try { tick = Symbol.TickSize; } catch { }
                double minMove = (tick > 0 && !double.IsNaN(tick) && !double.IsInfinity(tick))
                    ? tick * 2.0
                    : 1e-9;

                if (Math.Abs(current - entry) >= minMove && Math.Abs(den) > 1e-12)
                {
                    double m = gross / den;
                    if (m > 0 && !double.IsNaN(m) && !double.IsInfinity(m))
                    {
                        m = NormalizeMultiplier(m);
                        lock (CacheLock) { MultiplierCache[key] = m; }
                        return m;
                    }
                }
            }
            catch
            {
                // fallback abaixo
            }

            lock (CacheLock)
            {
                double cached;
                if (MultiplierCache.TryGetValue(key, out cached) && cached > 0) return cached;
            }

            try
            {
                double lot = Symbol.LotSize;
                if (lot > 0 && !double.IsNaN(lot) && !double.IsInfinity(lot)) return lot;
            }
            catch
            {
                // fallback final
            }

            return 1.0;
        }

        private static double NormalizeMultiplier(double m)
        {
            if (m <= 0) return m;
            double rounded = Math.Round(m);
            if (Math.Abs(m - rounded) <= Math.Max(0.02, m * 0.005)) return rounded;
            return Math.Round(m, 4);
        }

        private static string CacheKey(Position pos)
        {
            return MultiplierKey(pos.ConnectionId, pos.Account?.Id, pos.Symbol?.Name);
        }

        private static string MultiplierKey(string connectionId, string accountId, string symbol)
        {
            return (connectionId ?? "") + "|" + (accountId ?? "") + "|" + (symbol ?? "");
        }

        private void AddLine(Graphics gr, Rectangle rect, IChartWindowCoordinatesConverter converter, double price, Color color, DashStyle style, float width)
        {
            double y;
            try { y = converter.GetChartY(price); }
            catch { return; }

            if (double.IsNaN(y) || double.IsInfinity(y)) return;
            float yy = (float)y;
            if (yy < rect.Top - 2f || yy > rect.Bottom + 2f) return;

            using (var pen = new Pen(color, width) { DashStyle = style })
                gr.DrawLine(pen, rect.Left, yy, rect.Right, yy);
        }

        private string FormatPriceText(double price)
        {
            try { return Symbol.FormatPrice(price); }
            catch { return price.ToString("0.########", CultureInfo.InvariantCulture); }
        }

        private static string FormatQty(double qty)
        {
            return qty.ToString("0.####", CultureInfo.InvariantCulture);
        }

        private string SignedMoney(double value, string currencyCode)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "";
            string currency = CurrencyText(currencyCode);
            string number = Math.Abs(value).ToString("#,##0.00", CultureInfo.InvariantCulture);
            return (value >= 0 ? "+" : "-") + currency + number;
        }

        private string CurrencyText(string code)
        {
            if (!string.IsNullOrWhiteSpace(CurrencySymbol)) return CurrencySymbol.Trim();

            switch ((code ?? "").Trim().ToUpperInvariant())
            {
                case "USD": return "$";
                case "EUR": return "€";
                case "GBP": return "£";
                case "JPY": return "¥";
                case "BRL": return "R$";
                case "AUD": return "A$";
                case "CAD": return "C$";
                case "CHF": return "CHF ";
                default: return string.IsNullOrEmpty(code) ? "" : code.Trim() + " ";
            }
        }

        private static string FormatR(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return "R n/a";
            return (value >= 0 ? "+" : "") + value.ToString("0.00", CultureInfo.InvariantCulture) + "R";
        }

        private static string ShortAccount(string account)
        {
            if (string.IsNullOrWhiteSpace(account)) return "";
            account = account.Trim();
            return account.Length <= 16 ? account : account.Substring(0, 15) + "â€¦";
        }

        private Font GetFont()
        {
            if (_font != null) return _font;
            float size = FontSize;
            if (size < 6f) size = 6f;
            if (size > 24f) size = 24f;
            _font = new Font("Segoe UI", size, FontStyle.Bold, GraphicsUnit.Point);
            return _font;
        }

        private void ResetFont()
        {
            if (_font == null) return;
            try { _font.Dispose(); } catch { }
            _font = null;
        }

        private void SafeRedraw()
        {
            try
            {
                var chart = CurrentChart;
                if (chart != null) chart.RedrawBuffer();
            }
            catch
            {
                // Redraw e apenas estetico; nunca deve derrubar a UI.
            }
        }
    }
}

