# NSEPulse Trading App

A beautiful, responsive NSE-focused paper trading dashboard built with Vite and
vanilla JavaScript.

## Features

- Responsive market dashboard for mobile, tablet, and desktop screens
- NSE `.NS` equity symbol search and curated watchlist
- Free public Yahoo Finance chart endpoint integration, with demo fallback data
- Interactive price chart ranges
- Paper trade ticket for buy/sell practice orders
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

The app requests quote snapshots from Yahoo Finance's free public chart endpoint
for NSE symbols such as `RELIANCE.NS`, `TCS.NS`, and `INFY.NS`. If the endpoint
is blocked or unavailable, the UI continues to work with bundled demo fallback
data.

This is a paper trading/learning interface only. It does not connect to an NSE
broker, place real orders, or provide financial advice.
