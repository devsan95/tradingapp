import { defineConfig } from "vite";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const VALID_SYMBOL = /^[A-Z0-9.^-]+(?:\.NS)?$/;
const UPSTOX_ORDER_URL = "https://api.upstox.com/v2/order/place";
const KITE_ORDER_URL = "https://api.kite.trade/orders/regular";
const UPSTOX_INSTRUMENTS = {
  "RELIANCE.NS": "NSE_EQ|INE002A01018",
  "TCS.NS": "NSE_EQ|INE467B01029",
  "HDFCBANK.NS": "NSE_EQ|INE040A01034",
  "INFY.NS": "NSE_EQ|INE009A01021",
  "ICICIBANK.NS": "NSE_EQ|INE090A01021",
  "SBIN.NS": "NSE_EQ|INE062A01020",
  "LT.NS": "NSE_EQ|INE018A01030",
  "BHARTIARTL.NS": "NSE_EQ|INE397D01024"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function getOrderConfig() {
  const requestedMode = process.env.NSEPULSE_TRADING_MODE?.toLowerCase();
  const broker = process.env.NSEPULSE_BROKER?.toLowerCase() || "paper";
  const isLive = requestedMode === "live" && ["zerodha", "upstox"].includes(broker);

  return {
    mode: isLive ? "live" : "paper",
    broker: isLive ? broker : "paper",
    supportedBrokers: ["zerodha", "upstox"]
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 100000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    request.on("error", reject);
  });
}

function validateOrder(order) {
  const symbol = String(order.symbol || "").trim().toUpperCase();
  const side = String(order.side || "").trim().toUpperCase();
  const orderType = String(order.orderType || "LIMIT").trim().toUpperCase();
  const product = String(order.product || "CNC").trim().toUpperCase();
  const quantity = Number(order.quantity);
  const price = Number(order.price || 0);

  if (!symbol || !VALID_SYMBOL.test(symbol) || symbol.startsWith("^")) {
    throw new Error("Enter a valid NSE equity symbol.");
  }

  if (!["BUY", "SELL"].includes(side)) {
    throw new Error("Order side must be BUY or SELL.");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive whole number.");
  }

  if (!["LIMIT", "MARKET"].includes(orderType)) {
    throw new Error("Order type must be LIMIT or MARKET.");
  }

  if (orderType === "LIMIT" && (!Number.isFinite(price) || price <= 0)) {
    throw new Error("Limit orders require a positive price.");
  }

  if (!["CNC", "MIS"].includes(product)) {
    throw new Error("Product must be CNC or MIS.");
  }

  return {
    symbol,
    tradingsymbol: symbol.replace(".NS", ""),
    side,
    orderType,
    product,
    quantity,
    price: orderType === "MARKET" ? 0 : price,
    confirmLiveOrder: Boolean(order.confirmLiveOrder)
  };
}

function createChartProxyMiddleware() {
  return async function chartProxyMiddleware(request, response, next) {
    if (!request.url?.startsWith("/api/chart")) {
      next();
      return;
    }

    const requestUrl = new URL(request.url, "http://localhost");
    const symbol = requestUrl.searchParams.get("symbol")?.trim().toUpperCase();
    const range = requestUrl.searchParams.get("range") || "5d";
    const interval = requestUrl.searchParams.get("interval") || "15m";

    if (!symbol || !VALID_SYMBOL.test(symbol)) {
      sendJson(response, 400, { error: "A valid NSE symbol is required." });
      return;
    }

    const upstreamUrl = new URL(`${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}`);
    upstreamUrl.searchParams.set("range", range);
    upstreamUrl.searchParams.set("interval", interval);
    upstreamUrl.searchParams.set("includePrePost", "false");

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 NSEPulse/1.0"
        }
      });
      const payload = await upstreamResponse.text();

      response.writeHead(upstreamResponse.status, {
        "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store"
      });
      response.end(payload);
    } catch (error) {
      sendJson(response, 502, {
        error: "Unable to fetch live market data.",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

async function placeZerodhaOrder(order) {
  const apiKey = process.env.KITE_API_KEY;
  const accessToken = process.env.KITE_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    throw new Error("Set KITE_API_KEY and KITE_ACCESS_TOKEN to enable Zerodha live orders.");
  }

  const form = new URLSearchParams({
    exchange: "NSE",
    tradingsymbol: order.tradingsymbol,
    transaction_type: order.side,
    order_type: order.orderType,
    quantity: String(order.quantity),
    product: order.product,
    validity: "DAY"
  });

  if (order.orderType === "LIMIT") {
    form.set("price", String(order.price));
  }

  const response = await fetch(KITE_ORDER_URL, {
    method: "POST",
    headers: {
      Authorization: `token ${apiKey}:${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Kite-Version": "3"
    },
    body: form
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || `Zerodha order failed with ${response.status}.`);
  }

  return payload;
}

async function placeUpstoxOrder(order) {
  const accessToken = process.env.UPSTOX_ACCESS_TOKEN;
  const instrumentToken = UPSTOX_INSTRUMENTS[order.symbol] || process.env[`UPSTOX_INSTRUMENT_${order.tradingsymbol}`];

  if (!accessToken) {
    throw new Error("Set UPSTOX_ACCESS_TOKEN to enable Upstox live orders.");
  }

  if (!instrumentToken) {
    throw new Error(`No Upstox instrument token configured for ${order.symbol}.`);
  }

  const response = await fetch(UPSTOX_ORDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      quantity: order.quantity,
      product: order.product === "CNC" ? "D" : "I",
      validity: "DAY",
      price: order.price,
      tag: "NSEPulse",
      instrument_token: instrumentToken,
      order_type: order.orderType,
      transaction_type: order.side,
      disclosed_quantity: 0,
      trigger_price: 0,
      is_amo: false
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.errors?.[0]?.message || `Upstox order failed with ${response.status}.`);
  }

  return payload;
}

function createOrderMiddleware() {
  return async function orderMiddleware(request, response, next) {
    if (request.url?.startsWith("/api/order-mode")) {
      sendJson(response, 200, getOrderConfig());
      return;
    }

    if (!request.url?.startsWith("/api/orders")) {
      next();
      return;
    }

    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Only POST is supported for orders." });
      return;
    }

    try {
      const config = getOrderConfig();
      const order = validateOrder(await readJsonBody(request));

      if (config.mode !== "live") {
        sendJson(response, 200, {
          mode: "paper",
          broker: "paper",
          orderId: `PAPER-${Date.now()}`,
          order
        });
        return;
      }

      if (!order.confirmLiveOrder) {
        sendJson(response, 400, {
          error: "Confirm live order routing before sending to your broker."
        });
        return;
      }

      const raw =
        config.broker === "zerodha" ? await placeZerodhaOrder(order) : await placeUpstoxOrder(order);

      sendJson(response, 200, {
        mode: "live",
        broker: config.broker,
        orderId: raw?.data?.order_id || raw?.order_id || raw?.data?.order_ids?.[0] || null,
        raw
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/.git/**", "**/.vs/**", "**/node_modules/**", "**/dist/**"]
    }
  },
  plugins: [
    {
      name: "nsepulse-chart-proxy",
      configureServer(server) {
        server.middlewares.use(createChartProxyMiddleware());
        server.middlewares.use(createOrderMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createChartProxyMiddleware());
        server.middlewares.use(createOrderMiddleware());
      }
    }
  ],
  preview: {
    cors: false
  }
});
