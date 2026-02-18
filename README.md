# Strike POS PWA

A point-of-sale web app that accepts Bitcoin/Lightning payments via the [Strike API](https://docs.strike.me). Prices can be entered in USD or sats; products are selected from a local menu or added as custom amounts. The final bill is paid by generating a Lightning invoice (QR code) through Strike.

- **PWA**: Installable on phone and tablet; works offline for the POS UI; invoice creation requires network.
- **Local data**: Menu and cart are stored only on the device (localStorage). No server-side menu or cart.
- **Invoice API**: Use either a backend proxy (recommended) or a Strike API key stored locally (single trusted device only).

## Quick start

### 1. Backend proxy (recommended)

Set `STRIKE_API_KEY` in your environment and deploy the API:

- **Vercel**: Deploy the repo; add `STRIKE_API_KEY` (and optionally `STRIKE_SANDBOX=true`) in Project Settings → Environment Variables. The route `POST /api/create-invoice` is served from `api/create-invoice.js`.
- **Local**: From the project directory run:
  ```bash
  STRIKE_API_KEY=your_key node server.js
  ```
  Then open http://localhost:3000 . For sandbox, set `STRIKE_SANDBOX=true`.

### 2. Frontend

- **With local server**: `node server.js` serves the app and the same `POST /api/create-invoice` endpoint.
- **Static hosting**: Upload the project (without `server.js` and `api/`) to any static host. In the app, open **Settings** and set **Proxy URL** to your deployed API base URL (e.g. `https://your-app.vercel.app`).

### 3. Settings in the app

- **Proxy URL**: Your backend base URL (e.g. `https://your-api.vercel.app`). No trailing slash. Invoice requests go to `{Proxy URL}/api/create-invoice`.
- **Or API key**: You can instead enter your Strike API key (stored locally). Use only on a single trusted device; for shared or public use, use the proxy.
- **Use Strike sandbox**: Enable for testnet/sandbox (requires a sandbox API key from [Sandbox Dashboard](https://dev.dashboard.strike.me/)).

**Required API key scopes**: The key (whether used in the proxy or in the app) must have **Create invoice** (`partner.invoice.create`) and **Generate invoice quote** (`partner.invoice.quote.generate`). Add these in the [Strike Dashboard](https://dashboard.strike.me/) (or Sandbox Dashboard) when creating or editing your API key. If you see "Insufficient permissions", enable those two scopes and try again.

## API proxy request/response

- **POST** `{base}/api/create-invoice`
- **Body**: `{ "amount": "12.50", "currency": "USD", "description": "optional" }`  
  For sats: `{ "amount": "12500", "currency": "sats" }`
- **Response**: `{ "lnInvoice": "...", "expirationInSec": 30, "invoiceId": "...", "expiration": "..." }`

## File structure

- `index.html`, `styles.css`, `app.js` – PWA UI (POS, menu, cart, checkout, settings).
- `sw.js` – Service worker (offline cache for static assets).
- `manifest.json` – PWA manifest (name, start_url, display, icons).
- `api/create-invoice.js` – Serverless handler (Strike create invoice + quote, return `lnInvoice`).
- `server.js` – Local dev server (static files + same API for development).

## License

MIT
