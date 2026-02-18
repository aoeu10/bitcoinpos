/**
 * Strike POS PWA - Create Invoice API
 * Serverless endpoint: POST /api/create-invoice
 * Keeps STRIKE_API_KEY server-side only.
 */

const STRIKE_API_BASE = process.env.STRIKE_SANDBOX === 'true'
  ? 'https://api.dev.strike.me'
  : 'https://api.strike.me';

const SATS_PER_BTC = 100_000_000;

function parseBody(event) {
  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch {
      return null;
    }
  }
  return event.body || null;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return respond(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'STRIKE_API_KEY not configured' });
  }

  const body = parseBody(event);
  if (!body || body.amount == null) {
    return respond(400, { error: 'Request body must include amount and currency' });
  }

  let currency = (body.currency || 'USD').toUpperCase();
  let amountStr = String(body.amount).trim();

  if (currency === 'SATS') {
    const sats = parseInt(amountStr, 10);
    if (isNaN(sats) || sats <= 0) {
      return respond(400, { error: 'Invalid sats amount' });
    }
    currency = 'BTC';
    amountStr = (sats / SATS_PER_BTC).toFixed(8);
  }

  const allowedCurrencies = ['USD', 'EUR', 'GBP', 'AUD', 'USDT', 'BTC'];
  if (!allowedCurrencies.includes(currency)) {
    return respond(400, { error: `Currency must be one of: ${allowedCurrencies.join(', ')}, or sats` });
  }

  const description = (body.description || 'POS sale').slice(0, 200);
  const correlationId = body.correlationId ? String(body.correlationId).slice(0, 40) : undefined;

  const invoicePayload = {
    amount: { currency, amount: amountStr },
    description,
    ...(correlationId && { correlationId }),
  };

  try {
    const createRes = await fetch(`${STRIKE_API_BASE}/v1/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(invoicePayload),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      return respond(createRes.status, {
        error: errData.data?.message || createRes.statusText,
        code: errData.data?.code,
      });
    }

    const invoice = await createRes.json();
    const invoiceId = invoice.invoiceId;

    const quoteRes = await fetch(`${STRIKE_API_BASE}/v1/invoices/${invoiceId}/quote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!quoteRes.ok) {
      const errData = await quoteRes.json().catch(() => ({}));
      return respond(quoteRes.status, {
        error: errData.data?.message || quoteRes.statusText,
        code: errData.data?.code,
      });
    }

    const quote = await quoteRes.json();

    return respond(200, {
      lnInvoice: quote.lnInvoice,
      expirationInSec: quote.expirationInSec,
      invoiceId,
      expiration: quote.expiration,
    });
  } catch (err) {
    return respond(500, { error: err.message || 'Strike API request failed' });
  }
};
