# Strike POS PWA

A point-of-sale web app that accepts Bitcoin/Lightning payments via the [Strike API](https://docs.strike.me). Prices can be entered in USD or sats; products are selected from a local menu or added as custom amounts. The final bill is paid by generating a Lightning invoice (QR code) through Strike. The app polls invoice status and shows a receipt when the payment is confirmed.

- **PWA**: Installable on phone and tablet; works offline for the POS UI; invoice creation and status checks require network.
- **Local data**: Menu, cart, transactions, receipts, and settings (including API key) are stored only on the device (localStorage). No server-side menu or cart.
- **API key**: Enter your Strike API key in **Settings**. It is stored locally in the browser. Use only on a single trusted device.

## Features

- **POS**: Keypad and product grid; cart with subtotal in USD and sats; settlement in USD or sats.
- **Customer flow**: “Ready for payment” switches to a customer view with itemized bill, tax, tip options (or custom tip), and “Pay with Bitcoin”.
- **Receipts**: After payment, view and print receipts; receipts are stored on device.
- **Reconciliation**: Today / this week / this month summary (sales, tips, taxes); list of receipts; optional list of pending unpaid invoices; export PDF and print.
- **Business**: Custom business name and header image URL (shown in header and on exports).
- **Tax & tips**: Configurable tax rate and default tip percentages (e.g. 15%, 20%).
- **Categories & products**: Manage categories and products in Settings; products can be priced in USD or sats.
- **Protect mode**: Optional 4-digit PIN to open Reconciliation and Settings.
- **Developer mode**: Optional “Pretend to pay” on checkout for testing without real payment.
- **Export & import**: Backup transactions and/or settings as JSON; optional encrypted (password-protected) export. Restore via import.

## Quick start

### 1. Run the app

- **Static hosting**: Upload the project to any static host. No server required; the app calls the Strike API directly from the browser using the key stored in Settings. The latest version is able to be accessed here: [BitcoinPOS](https://aoeu10.github.io/bitcoinpos/)

### 2. Configure in the app

- Open **Settings** and enter your **Strike API key**. The key is stored only in this device’s browser.

**Required API key scopes**: Create invoice (`partner.invoice.create`), Generate invoice quote (`partner.invoice.quote.generate`), and Read currency exchange rate tickers (`partner.rates.ticker`). Add these in the [Strike Dashboard](https://dashboard.strike.me/). Do not enable send or withdrawal scopes for this app.

## API (for proxy or integration)

- **POST** `{base}/api/create-invoice`  
  **Body**: `{ "amount": "12.50", "currency": "USD", "description": "optional" }` or for sats: `{ "amount": "12500", "currency": "sats" }`  
  **Response**: `{ "lnInvoice": "...", "expirationInSec": 30, "invoiceId": "...", "expiration": "..." }`

- **GET** `{base}/api/get-invoice?id={invoiceId}`  
  **Response**: `{ "state": "PAID" | "UNPAID" | ..., "invoiceId": "..." }`

## File structure

- `index.html`, `styles.css`, `app.js` – PWA UI (POS, menu, cart, checkout, receipts, reconciliation, about, settings).
- `sw.js` – Service worker (offline cache for static assets).
- `manifest.json` – PWA manifest (name, start_url, display, icons).
- `icons/icon.svg` – App icon.
- `js/qrcode.min.js` – QR code library for Lightning invoice display.
- `api/create-invoice.js` – Serverless create-invoice handler (for optional proxy).
- `api/get-invoice.js` – Serverless get-invoice handler (for optional proxy).
- `server.js` – Local dev server (static files and same API routes for development).
- `vercel.json` – Vercel config for deploying the API routes.

## License

MIT
