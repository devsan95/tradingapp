import { defineConfig } from "vite";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const VALID_SYMBOL = /^[A-Z0-9.^-]+(?:\.NS)?$/;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
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
      },
      configurePreviewServer(server) {
        server.middlewares.use(createChartProxyMiddleware());
      }
    }
  ],
  preview: {
    cors: false
  }
});
