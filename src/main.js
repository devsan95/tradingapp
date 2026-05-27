import "./styles.css";

const API_ENDPOINT = "/api/chart";
const ORDER_MODE_ENDPOINT = "/api/order-mode";
const ORDER_ENDPOINT = "/api/orders";
const LIVE_REFRESH_MS = 10 * 1000;
const ORDER_HISTORY_KEY = "nsepulse.orders";

const NSE_SYMBOLS = [
  { symbol: "RELIANCE.NS", short: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS.NS", short: "TCS", name: "Tata Consultancy Services", sector: "IT Services" },
  { symbol: "HDFCBANK.NS", short: "HDFC BANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY.NS", short: "INFY", name: "Infosys", sector: "IT Services" },
  { symbol: "ICICIBANK.NS", short: "ICICI", name: "ICICI Bank", sector: "Banking" },
  { symbol: "SBIN.NS", short: "SBI", name: "State Bank of India", sector: "Banking" },
  { symbol: "LT.NS", short: "L&T", name: "Larsen & Toubro", sector: "Industrials" },
  { symbol: "BHARTIARTL.NS", short: "AIRTEL", name: "Bharti Airtel", sector: "Telecom" }
];

const SYMBOL_ALIASES = {
  NIFTY: "^NSEI",
  NIFTY50: "^NSEI",
  BANKNIFTY: "^NSEBANK",
  "NIFTYBANK": "^NSEBANK"
};

const FALLBACK_PRICES = {
  "RELIANCE.NS": { price: 1432.4, previousClose: 1418.25, volume: 6214800 },
  "TCS.NS": { price: 3924.55, previousClose: 3898.2, volume: 1782200 },
  "HDFCBANK.NS": { price: 1536.8, previousClose: 1546.35, volume: 9921000 },
  "INFY.NS": { price: 1488.95, previousClose: 1468.8, volume: 5129400 },
  "ICICIBANK.NS": { price: 1116.5, previousClose: 1103.4, volume: 8146300 },
  "SBIN.NS": { price: 821.35, previousClose: 815.1, volume: 14758300 },
  "LT.NS": { price: 3586.75, previousClose: 3548.2, volume: 1167300 },
  "BHARTIARTL.NS": { price: 1348.15, previousClose: 1329.9, volume: 2864700 },
  "^NSEI": { price: 23184.55, previousClose: 23092.2, volume: 0 },
  "^NSEBANK": { price: 49782.3, previousClose: 49510.8, volume: 0 }
};

const PAPER_POSITIONS = [
  { symbol: "RELIANCE.NS", quantity: 8, average: 1382.5 },
  { symbol: "INFY.NS", quantity: 12, average: 1432.2 },
  { symbol: "SBIN.NS", quantity: 20, average: 792.4 }
];

const state = {
  activeSymbol: "RELIANCE.NS",
  activeRange: "5d",
  activeInterval: "15m",
  orderSide: "buy",
  latestQuotes: new Map(),
  refreshing: false,
  submittingOrder: false,
  orderConfig: {
    mode: "paper",
    broker: "paper",
    maxOrderValue: 200000
  },
  orders: loadStoredOrders()
};

const els = {
  marketStatus: document.querySelector("#marketStatus"),
  symbolSearch: document.querySelector("#symbolSearch"),
  symbolInput: document.querySelector("#symbolInput"),
  quickSymbols: document.querySelector("#quickSymbols"),
  activeSymbolName: document.querySelector("#activeSymbolName"),
  activeSymbolMeta: document.querySelector("#activeSymbolMeta"),
  activePrice: document.querySelector("#activePrice"),
  activeChange: document.querySelector("#activeChange"),
  refreshQuotes: document.querySelector("#refreshQuotes"),
  priceChart: document.querySelector("#priceChart"),
  quoteStats: document.querySelector("#quoteStats"),
  rangeSwitcher: document.querySelector(".range-switcher"),
  orderSymbol: document.querySelector("#orderSymbol"),
  orderQty: document.querySelector("#orderQty"),
  orderType: document.querySelector("#orderType"),
  orderProduct: document.querySelector("#orderProduct"),
  orderPrice: document.querySelector("#orderPrice"),
  stopLossPrice: document.querySelector("#stopLossPrice"),
  targetPrice: document.querySelector("#targetPrice"),
  confirmLiveOrder: document.querySelector("#confirmLiveOrder"),
  orderEstimate: document.querySelector("#orderEstimate"),
  riskAmount: document.querySelector("#riskAmount"),
  rewardAmount: document.querySelector("#rewardAmount"),
  riskReward: document.querySelector("#riskReward"),
  orderModeChip: document.querySelector("#orderModeChip"),
  orderDisclaimer: document.querySelector("#orderDisclaimer"),
  submitOrder: document.querySelector("#submitOrder"),
  sideToggle: document.querySelector(".side-toggle"),
  orderForm: document.querySelector("#orderForm"),
  watchlistGrid: document.querySelector("#watchlistGrid"),
  dataSource: document.querySelector("#dataSource"),
  investedValue: document.querySelector("#investedValue"),
  currentValue: document.querySelector("#currentValue"),
  portfolioPnl: document.querySelector("#portfolioPnl"),
  positionsList: document.querySelector("#positionsList"),
  orderBlotter: document.querySelector("#orderBlotter"),
  clearOrders: document.querySelector("#clearOrders"),
  toast: document.querySelector("#toast")
};

function loadStoredOrders() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 25) : [];
  } catch {
    return [];
  }
}

function persistOrders() {
  window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(state.orders.slice(0, 25)));
}

function formatCurrency(value, compact = false) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard"
  }).format(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    notation: value > 100000 ? "compact" : "standard"
  }).format(value);
}

function formatChange(change, percent) {
  if (!Number.isFinite(change) || !Number.isFinite(percent)) {
    return "--";
  }

  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
}

function getProfile(symbol) {
  return (
    NSE_SYMBOLS.find((stock) => stock.symbol === symbol) ?? {
      symbol,
      short: symbol.replace(".NS", ""),
      name: symbol.replace(".NS", ""),
      sector: symbol.startsWith("^") ? "NSE Index" : "NSE Equity"
    }
  );
}

function normalizeSymbol(value) {
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9.^]/g, "");

  if (!clean) {
    return state.activeSymbol;
  }

  if (SYMBOL_ALIASES[clean]) {
    return SYMBOL_ALIASES[clean];
  }

  if (clean.startsWith("^") || clean.endsWith(".NS")) {
    return clean;
  }

  return `${clean}.NS`;
}

function getFallbackSnapshot(symbol, range = "1mo") {
  const base = FALLBACK_PRICES[symbol] ?? {
    price: 1000 + [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 1.7,
    previousClose: 990,
    volume: 1200000
  };
  const previousClose = base.previousClose || base.price * 0.985;
  const change = base.price - previousClose;
  const changePercent = (change / previousClose) * 100;
  const series = buildFallbackSeries(symbol, base.price, range);

  return {
    symbol,
    price: base.price,
    previousClose,
    change,
    changePercent,
    open: previousClose + change * 0.22,
    high: Math.max(base.price, previousClose) * 1.012,
    low: Math.min(base.price, previousClose) * 0.988,
    volume: base.volume,
    updatedAt: new Date(),
    source: "Demo fallback",
    series
  };
}

function buildFallbackSeries(symbol, latestPrice, range) {
  const pointsByRange = {
    "5d": 40,
    "1mo": 32,
    "6mo": 64,
    "1y": 54
  };
  const points = pointsByRange[range] ?? 36;
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const drift = (seed % 9) - 4;
  const volatility = Math.max(latestPrice * 0.0075, 2);

  return Array.from({ length: points }, (_, index) => {
    const distance = points - index - 1;
    const wave = Math.sin((index + seed) / 2.8) * volatility;
    const trend = distance * drift * 0.42;
    const close = latestPrice - trend + wave;

    return {
      date: new Date(Date.now() - distance * 60 * 60 * 1000),
      close: Math.max(close, 1)
    };
  });
}

async function fetchSnapshot(symbol, range = "1mo", interval = "1d") {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const url = new URL(API_ENDPOINT, window.location.origin);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("range", range);
    url.searchParams.set("interval", interval);

    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Quote request failed with ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];

    if (!result) {
      throw new Error("No chart result returned");
    }

    return parseYahooSnapshot(symbol, result);
  } catch (error) {
    console.info(`Using fallback data for ${symbol}:`, error.message);
    return getFallbackSnapshot(symbol, range);
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseYahooSnapshot(symbol, result) {
  const meta = result.meta ?? {};
  const quote = result.indicators?.quote?.[0] ?? {};
  const timestamps = result.timestamp ?? [];
  const closes = quote.close ?? [];
  const series = timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000),
      close: closes[index]
    }))
    .filter((point) => Number.isFinite(point.close));
  const lastClose = series.at(-1)?.close;
  const price = meta.regularMarketPrice ?? lastClose;

  if (!Number.isFinite(price)) {
    return getFallbackSnapshot(symbol);
  }

  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? series.at(-2)?.close ?? price;
  const change = price - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;
  const chartCloses = series.map((point) => point.close);

  return {
    symbol,
    price,
    previousClose,
    change,
    changePercent,
    open: quote.open?.findLast(Number.isFinite) ?? previousClose,
    high: meta.regularMarketDayHigh ?? Math.max(...chartCloses, price),
    low: meta.regularMarketDayLow ?? Math.min(...chartCloses, price),
    volume: meta.regularMarketVolume ?? quote.volume?.findLast(Number.isFinite) ?? 0,
    updatedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
    source: "Live via local Yahoo Finance proxy",
    series: series.length ? series : buildFallbackSeries(symbol, price, "1mo")
  };
}

function renderMarketStatus() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(new Date())
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});
  const day = parts.weekday;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekday = !["Sat", "Sun"].includes(day);
  const isOpen = isWeekday && minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;

  els.marketStatus.innerHTML = `
    <span class="status-dot" style="background:${isOpen ? "var(--blue)" : "var(--amber)"}; box-shadow:0 0 0 6px ${isOpen ? "rgba(37, 99, 235, 0.14)" : "rgba(96, 165, 250, 0.16)"}"></span>
    <span>${isOpen ? "NSE open" : "NSE closed"} · ${parts.hour}:${parts.minute} IST</span>
  `;
}

function renderQuickSymbols() {
  els.quickSymbols.innerHTML = NSE_SYMBOLS.slice(0, 6)
    .map(
      (stock) => `
        <button type="button" data-symbol="${stock.symbol}">${stock.short}</button>
      `
    )
    .join("");
}

function renderOrderSymbols() {
  els.orderSymbol.innerHTML = NSE_SYMBOLS.map(
    (stock) => `<option value="${stock.symbol}">${stock.short} · ${stock.name}</option>`
  ).join("");
}

async function loadActiveSymbol(symbol = state.activeSymbol) {
  state.activeSymbol = symbol;
  const profile = getProfile(symbol);

  els.activeSymbolName.textContent = profile.name;
  els.activeSymbolMeta.textContent = `${profile.symbol} · ${profile.sector}`;
  document.querySelector(".chart-panel").classList.add("is-loading");

  const snapshot = await fetchSnapshot(symbol, state.activeRange, state.activeInterval);
  state.latestQuotes.set(symbol, snapshot);

  renderActiveSnapshot(profile, snapshot);
  updateOrderFromQuote(snapshot);
  renderPortfolio();
  highlightActiveWatchCard();
  document.querySelector(".chart-panel").classList.remove("is-loading");
}

function renderActiveSnapshot(profile, snapshot) {
  const isPositive = snapshot.change >= 0;
  els.activeSymbolName.textContent = profile.name;
  els.activeSymbolMeta.textContent = `${profile.symbol} · ${profile.sector} · Updated ${snapshot.updatedAt.toLocaleTimeString(
    "en-IN",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
  els.activePrice.textContent = formatCurrency(snapshot.price);
  els.activeChange.textContent = formatChange(snapshot.change, snapshot.changePercent);
  els.activeChange.className = `change-pill ${isPositive ? "positive" : "negative"}`;
  els.priceChart.innerHTML = buildChart(snapshot.series, isPositive, "large");
  els.quoteStats.innerHTML = [
    ["Open", formatCurrency(snapshot.open)],
    ["High", formatCurrency(snapshot.high)],
    ["Low", formatCurrency(snapshot.low)],
    ["Prev close", formatCurrency(snapshot.previousClose)],
    ["Volume", formatNumber(snapshot.volume)],
    ["Source", snapshot.source]
  ]
    .map(
      ([label, value]) => `
        <div class="stat-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");
}

function buildChart(series, isPositive, size = "small") {
  const width = size === "large" ? 900 : 260;
  const height = size === "large" ? 320 : 54;
  const padding = size === "large" ? 28 : 2;
  const closes = series.map((point) => point.close).filter(Number.isFinite);

  if (closes.length < 2) {
    return `<div class="muted">Not enough chart data</div>`;
  }

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const spread = max - min || max * 0.01 || 1;
  const color = isPositive ? "#0b74de" : "#1d4ed8";
  const points = closes.map((close, index) => {
    const x = padding + (index / (closes.length - 1)) * (width - padding * 2);
    const y = height - padding - ((close - min) / spread) * (height - padding * 2);
    return [x, y];
  });
  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points.at(-1)[0].toFixed(2)} ${height - padding} L ${points[0][0].toFixed(
    2
  )} ${height - padding} Z`;
  const gridLines =
    size === "large"
      ? [0.25, 0.5, 0.75]
          .map((step) => {
            const y = height * step;
            return `<line x1="0" x2="${width}" y1="${y}" y2="${y}" stroke="rgba(37,99,235,0.1)" />`;
          })
          .join("")
      : "";

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="area-${size}-${isPositive ? "up" : "down"}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.32" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaPath}" fill="url(#area-${size}-${isPositive ? "up" : "down"})"></path>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="${size === "large" ? 4 : 2.5}" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

async function loadWatchlist(showPlaceholders = true) {
  if (showPlaceholders || !els.watchlistGrid.children.length) {
    els.watchlistGrid.innerHTML = NSE_SYMBOLS.map((stock) => renderWatchCard(stock)).join("");
  }

  const snapshots = await Promise.all(
    NSE_SYMBOLS.map(async (stock) => {
      const snapshot = await fetchSnapshot(stock.symbol, "5d", "30m");
      state.latestQuotes.set(stock.symbol, snapshot);
      return snapshot;
    })
  );

  els.watchlistGrid.innerHTML = NSE_SYMBOLS.map((stock) =>
    renderWatchCard(stock, state.latestQuotes.get(stock.symbol))
  ).join("");
  els.dataSource.textContent = snapshots.some((snapshot) => snapshot.source.includes("Yahoo"))
    ? "Yahoo Finance public chart API"
    : "Demo fallback data";
  highlightActiveWatchCard();
  renderPortfolio();
}

async function refreshLiveData(silent = true) {
  if (state.refreshing) {
    return;
  }

  state.refreshing = true;
  els.refreshQuotes.disabled = true;
  els.refreshQuotes.textContent = "Refreshing...";

  try {
    await Promise.all([loadActiveSymbol(state.activeSymbol), loadWatchlist(false)]);

    if (!silent) {
      showToast("Live stock data refreshed.");
    }
  } finally {
    state.refreshing = false;
    els.refreshQuotes.disabled = false;
    els.refreshQuotes.textContent = "Refresh live";
  }
}

function renderWatchCard(stock, snapshot = null) {
  const isActive = stock.symbol === state.activeSymbol;
  const isPositive = (snapshot?.change ?? 0) >= 0;

  return `
    <button class="watch-card ${isActive ? "active" : ""}" data-symbol="${stock.symbol}" type="button">
      <header>
        <div>
          <strong>${stock.short}</strong>
          <span>${stock.sector}</span>
        </div>
        <span class="change-pill ${isPositive ? "positive" : "negative"}">
          ${snapshot ? formatChange(snapshot.change, snapshot.changePercent) : "Loading"}
        </span>
      </header>
      <div class="mini-chart">${snapshot ? buildChart(snapshot.series, isPositive) : ""}</div>
      <footer>
        <span>${stock.name}</span>
        <strong>${snapshot ? formatCurrency(snapshot.price) : "--"}</strong>
      </footer>
    </button>
  `;
}

function highlightActiveWatchCard() {
  document.querySelectorAll(".watch-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.symbol === state.activeSymbol);
  });
}

function updateOrderFromQuote(snapshot = state.latestQuotes.get(state.activeSymbol)) {
  if (!snapshot) {
    return;
  }

  els.orderSymbol.value = snapshot.symbol;
  els.orderPrice.value = snapshot.price.toFixed(2);
  updateOrderEstimate();
}

function updateOrderEstimate() {
  const quantity = Number(els.orderQty.value);
  const price = Number(els.orderPrice.value);
  const stopLoss = Number(els.stopLossPrice.value);
  const target = Number(els.targetPrice.value);
  const estimate = quantity * price;
  const isBuy = state.orderSide === "buy";
  const riskPerShare =
    Number.isFinite(stopLoss) && stopLoss > 0 ? (isBuy ? price - stopLoss : stopLoss - price) : NaN;
  const rewardPerShare =
    Number.isFinite(target) && target > 0 ? (isBuy ? target - price : price - target) : NaN;
  const risk = riskPerShare > 0 ? riskPerShare * quantity : NaN;
  const reward = rewardPerShare > 0 ? rewardPerShare * quantity : NaN;
  const rr = Number.isFinite(risk) && risk > 0 && Number.isFinite(reward) ? reward / risk : NaN;

  els.orderEstimate.textContent = Number.isFinite(estimate) ? formatCurrency(estimate) : "--";
  els.riskAmount.textContent = Number.isFinite(risk) ? formatCurrency(risk) : "--";
  els.rewardAmount.textContent = Number.isFinite(reward) ? formatCurrency(reward) : "--";
  els.riskReward.textContent = Number.isFinite(rr) ? `1:${rr.toFixed(2)}` : "--";
}

function renderOrderMode() {
  const isLive = state.orderConfig.mode === "live";
  const brokerName = state.orderConfig.broker === "paper" ? "paper" : state.orderConfig.broker.toUpperCase();

  els.orderModeChip.textContent = isLive ? `Live via ${brokerName}` : "Paper mode";
  els.orderModeChip.className = `chip ${isLive ? "negative" : ""}`;
  els.submitOrder.textContent = isLive ? "Submit selected live order" : "Submit selected paper order";
  els.orderDisclaimer.textContent = isLive
    ? `Live mode is enabled. Buy now and Sell now send orders to ${brokerName} using your local broker token. Max order value: ${formatCurrency(
        state.orderConfig.maxOrderValue
      )}.`
    : `Paper mode is active. Buy now and Sell now submit simulated orders. Set broker environment variables locally to enable live routing. Max order value: ${formatCurrency(
        state.orderConfig.maxOrderValue
      )}.`;
}

async function loadOrderMode() {
  try {
    const response = await fetch(ORDER_MODE_ENDPOINT, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Order mode request failed with ${response.status}`);
    }

    state.orderConfig = await response.json();
  } catch (error) {
    console.info("Using paper order mode:", error.message);
    state.orderConfig = { mode: "paper", broker: "paper" };
  }

  renderOrderMode();
}

function setOrderControlsDisabled(disabled) {
  els.submitOrder.disabled = disabled;
  els.sideToggle.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

async function submitOrder(sideOverride = state.orderSide) {
  if (state.submittingOrder) {
    return;
  }

  state.orderSide = sideOverride;
  const side = state.orderSide.toUpperCase();
  const quantity = Number(els.orderQty.value);
  const symbol = els.orderSymbol.value;
  const price = Number(els.orderPrice.value);
  const stopLoss = Number(els.stopLossPrice.value);
  const target = Number(els.targetPrice.value);
  const orderType = els.orderType.value;
  const effectivePrice = orderType === "MARKET" ? state.latestQuotes.get(symbol)?.price ?? price : price;
  const orderValue = quantity * effectivePrice;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    showToast("Enter a valid quantity.");
    return;
  }

  if (orderType === "LIMIT" && (!Number.isFinite(price) || price <= 0)) {
    showToast("Enter a valid limit price.");
    return;
  }

  if (!Number.isFinite(orderValue) || orderValue > state.orderConfig.maxOrderValue) {
    showToast(`Order value exceeds ${formatCurrency(state.orderConfig.maxOrderValue)} limit.`);
    return;
  }

  state.submittingOrder = true;
  setOrderControlsDisabled(true);
  els.submitOrder.textContent = `${side} ${state.orderConfig.mode === "live" ? "sending..." : "placing..."}`;

  try {
    const response = await fetch(ORDER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        symbol,
        side,
        quantity,
        orderType,
        product: els.orderProduct.value,
        price: orderType === "MARKET" ? 0 : price,
        estimatedPrice: effectivePrice,
        stopLoss: Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
        target: Number.isFinite(target) && target > 0 ? target : null,
        confirmLiveOrder: els.confirmLiveOrder.checked
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Order request failed with ${response.status}`);
    }

    const orderId = payload.orderId || payload.raw?.order_id || payload.raw?.data?.order_id || "accepted";
    recordOrder({
      id: orderId,
      mode: payload.mode,
      broker: payload.broker,
      symbol,
      side,
      quantity,
      orderType,
      product: els.orderProduct.value,
      price: orderType === "MARKET" ? effectivePrice : price,
      stopLoss: Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
      target: Number.isFinite(target) && target > 0 ? target : null,
      status: payload.mode === "live" ? "Sent to broker" : "Paper filled",
      timestamp: new Date().toISOString()
    });
    showToast(`${payload.mode === "live" ? "Live" : "Paper"} ${side} order ${orderId} submitted.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.submittingOrder = false;
    setOrderControlsDisabled(false);
    renderOrderMode();
  }
}

function recordOrder(order) {
  state.orders = [order, ...state.orders].slice(0, 25);
  persistOrders();
  renderOrderBlotter();
}

function renderOrderBlotter() {
  if (!state.orders.length) {
    els.orderBlotter.innerHTML = `<div class="empty-state">No orders yet. Submitted paper and broker orders appear here.</div>`;
    return;
  }

  els.orderBlotter.innerHTML = state.orders
    .map((order) => {
      const isBuy = order.side === "BUY";
      const time = new Date(order.timestamp).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
      const protection = [order.stopLoss ? `SL ${formatCurrency(order.stopLoss)}` : null, order.target ? `TGT ${formatCurrency(order.target)}` : null]
        .filter(Boolean)
        .join(" · ");

      return `
        <div class="order-row">
          <div>
            <strong class="${isBuy ? "positive-text" : "negative-text"}">${order.side} ${order.quantity} ${order.symbol}</strong>
            <span>${order.mode?.toUpperCase() || "PAPER"} · ${order.orderType} · ${order.product} · ${
              protection || "No protection levels"
            }</span>
          </div>
          <div class="order-meta">
            <strong>${formatCurrency(order.price)}</strong>
            <span>${order.status} · ${time}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPortfolio() {
  const rows = PAPER_POSITIONS.map((position) => {
    const snapshot = state.latestQuotes.get(position.symbol) ?? getFallbackSnapshot(position.symbol);
    const profile = getProfile(position.symbol);
    const invested = position.quantity * position.average;
    const current = position.quantity * snapshot.price;
    const pnl = current - invested;

    return { ...position, profile, snapshot, invested, current, pnl };
  });
  const investedTotal = rows.reduce((sum, position) => sum + position.invested, 0);
  const currentTotal = rows.reduce((sum, position) => sum + position.current, 0);
  const pnlTotal = currentTotal - investedTotal;

  els.investedValue.textContent = formatCurrency(investedTotal, true);
  els.currentValue.textContent = formatCurrency(currentTotal, true);
  els.portfolioPnl.textContent = formatCurrency(pnlTotal);
  els.portfolioPnl.className = pnlTotal >= 0 ? "positive" : "negative";
  els.positionsList.innerHTML = rows
    .map(
      (position) => `
        <div class="position-row">
          <div>
            <strong>${position.profile.short}</strong>
            <span>${position.quantity} shares · Avg ${formatCurrency(position.average)}</span>
          </div>
          <div>
            <strong class="${position.pnl >= 0 ? "positive-text" : "negative-text"}">${formatCurrency(
              position.pnl
            )}</strong>
            <span>LTP ${formatCurrency(position.snapshot.price)}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function bindEvents() {
  els.quickSymbols.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-symbol]");

    if (button) {
      loadActiveSymbol(button.dataset.symbol);
    }
  });

  els.symbolSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(els.symbolInput.value);
    els.symbolInput.value = symbol;
    loadActiveSymbol(symbol);
  });

  els.refreshQuotes.addEventListener("click", () => refreshLiveData(false));

  els.rangeSwitcher.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-range]");

    if (!button) {
      return;
    }

    document
      .querySelectorAll(".range-switcher button")
      .forEach((rangeButton) => rangeButton.classList.toggle("active", rangeButton === button));
    state.activeRange = button.dataset.range;
    state.activeInterval = button.dataset.interval;
    loadActiveSymbol(state.activeSymbol);
  });

  els.watchlistGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".watch-card");

    if (card) {
      loadActiveSymbol(card.dataset.symbol);
      document.querySelector("#top").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  els.orderSymbol.addEventListener("change", () => loadActiveSymbol(els.orderSymbol.value));
  els.orderQty.addEventListener("input", updateOrderEstimate);
  els.orderPrice.addEventListener("input", updateOrderEstimate);
  els.stopLossPrice.addEventListener("input", updateOrderEstimate);
  els.targetPrice.addEventListener("input", updateOrderEstimate);
  els.orderType.addEventListener("change", () => {
    const isMarket = els.orderType.value === "MARKET";
    els.orderPrice.disabled = isMarket;
    updateOrderEstimate();
  });

  els.sideToggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-side]");

    if (!button) {
      return;
    }

    state.orderSide = button.dataset.side;
    els.sideToggle
      .querySelectorAll("button")
      .forEach((sideButton) => sideButton.classList.toggle("active", sideButton === button));
    updateOrderEstimate();
    submitOrder(button.dataset.side);
  });

  els.clearOrders.addEventListener("click", () => {
    state.orders = [];
    persistOrders();
    renderOrderBlotter();
  });

  els.orderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitOrder();
  });
}

function init() {
  renderMarketStatus();
  renderQuickSymbols();
  renderOrderSymbols();
  renderOrderMode();
  renderOrderBlotter();
  renderPortfolio();
  bindEvents();
  loadOrderMode();
  refreshLiveData();
  window.setInterval(renderMarketStatus, 60 * 1000);
  window.setInterval(refreshLiveData, LIVE_REFRESH_MS);
}

init();
