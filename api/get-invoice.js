/**
 * Strike POS PWA - Get Invoice Status API
 * GET /api/get-invoice?id={invoiceId}
 * Returns invoice state (e.g. UNPAID, PAID) so the client can show payment confirmation.
 */

const STRIKE_API_BASE = process.env.STRIKE_SANDBOX === 'true'
  ? 'https://api.dev.strike.me'
  : 'https://api.strike.me';

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return respond(204, {});
  }

  if (event.httpMethod !== 'GET') {
    return respond(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.STRIKE_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'STRIKE_API_KEY not configured' });
  }

  const params = event.queryStringParameters || {};
  const invoiceId = params.id || params.invoiceId;
  if (!invoiceId) {
    return respond(400, { error: 'Missing query parameter: id' });
  }

  try {
    const res = await fetch(`${STRIKE_API_BASE}/v1/invoices/${invoiceId}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return respond(res.status, {
        error: errData.data?.message || res.statusText,
        code: errData.data?.code,
      });
    }

    const invoice = await res.json();
    return respond(200, { state: invoice.state, invoiceId: invoice.invoiceId });
  } catch (err) {
    return respond(500, { error: err.message || 'Strike API request failed' });
  }
};
