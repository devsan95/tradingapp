# NSEPulse Trading App

A beautiful, responsive NSE-focused paper trading dashboard built with Vite and
vanilla JavaScript.

## Features

- Responsive market dashboard for mobile, tablet, and desktop screens
- NSE `.NS` equity symbol search and curated watchlist
- Free public Yahoo Finance chart endpoint integration through a local Vite API proxy
- Automatic live quote refresh every 10 seconds, plus manual refresh
- Interactive price chart ranges
- Practical trade ticket with Buy now/Sell now execution buttons, order type, product, stop loss, target, and risk/reward preview
- Broker order endpoint for Zerodha Kite or Upstox live routing when configured
- Recent order blotter stored locally in the browser
- Practice portfolio with unrealized P&L

## Run locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Data source

The app requests quote snapshots through `/api/chart`, a Vite development and
preview proxy that calls Yahoo Finance's free public chart endpoint from Node.js.
This avoids browser CORS issues for NSE symbols such as `RELIANCE.NS`, `TCS.NS`,
and `INFY.NS`. If the endpoint is unavailable, the UI continues to work with
bundled demo fallback data.

Public free feeds may be delayed or rate limited. For real-money execution, use
an exchange-authorized broker/data vendor API.

This is a paper trading/learning interface only. It does not connect to an NSE
broker by default or provide financial advice.

## Live order routing

Retail apps cannot send orders directly to NSE. Live orders must go through your
SEBI-registered broker account after KYC, broker API approval, and local access
token setup. NSEPulse keeps paper mode enabled by default.

To enable live order routing locally, set one of these broker configurations
before running `npm run dev`:

### Zerodha Kite

```bash
NSEPULSE_TRADING_MODE=live \
NSEPULSE_BROKER=zerodha \
KITE_API_KEY=your_api_key \
KITE_ACCESS_TOKEN=your_access_token \
npm run dev
```

### Upstox

```bash
NSEPULSE_TRADING_MODE=live \
NSEPULSE_BROKER=upstox \
UPSTOX_ACCESS_TOKEN=your_access_token \
npm run dev
```

On Windows PowerShell:

```powershell
$env:NSEPULSE_TRADING_MODE="live"
$env:NSEPULSE_BROKER="zerodha"
$env:KITE_API_KEY="your_api_key"
$env:KITE_ACCESS_TOKEN="your_access_token"
npm run dev
```

The app requires the live-order confirmation checkbox before it forwards an
order to the configured broker. Keep credentials out of Git and never expose
access tokens in client-side code.

Optional guardrail:

```bash
NSEPULSE_MAX_ORDER_VALUE=50000 npm run dev
```

`NSEPULSE_MAX_ORDER_VALUE` caps each order's estimated value on both the client
and local server. The default is `200000`.
