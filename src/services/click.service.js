const { config } = require('../config');
const logger = require('../logger');
const { buildClickAuthHeader } = require('../utils/clickAuth');

function toYYYYMMDD(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildClickPayUrl({ amount, transactionParam, returnUrl, cardType }) {
  // Click payment URL format: https://my.click.uz/services/pay
  const url = new URL('/services/pay', config.click.baseUrl);
  url.searchParams.set('service_id', String(config.click.serviceId));
  url.searchParams.set('merchant_id', String(config.click.merchantId));
  url.searchParams.set('amount', String(Math.round(amount)));
  url.searchParams.set('transaction_param', String(transactionParam));

  if (returnUrl || config.click.returnUrl) {
    url.searchParams.set('return_url', String(returnUrl || config.click.returnUrl));
  }

  if (cardType || config.click.cardType) {
    url.searchParams.set('card_type', String(cardType || config.click.cardType));
  }

  const finalUrl = url.toString();
  logger.info('Click payment URL', {
    url: finalUrl,
    amount: Math.round(amount),
    service_id: config.click.serviceId,
    merchant_id: config.click.merchantId
  });
  return finalUrl;
}

async function clickApiRequest(method, path, { json } = {}) {
  // Ensure we keep the /v2/merchant prefix; leading slash in `path` would drop it.
  const base = config.click.apiBaseUrl.endsWith('/')
    ? config.click.apiBaseUrl
    : `${config.click.apiBaseUrl}/`;
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const url = new URL(normalizedPath, base).toString();
  const { authHeaderValue } = buildClickAuthHeader({
    merchantUserId: config.click.merchantUserId,
    secretKey: config.click.secretKey
  });

  const headers = {
    Accept: 'application/json',
    Auth: authHeaderValue
  };

  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  logger.info('CLICK API request', { method, url, json });

  const res = await fetch(url, { method, headers, body }).catch((err) => {
    logger.error('CLICK API network error', { method, url, error: err.message });
    throw err;
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    logger.error('CLICK API non-200 response', { method, url, status: res.status, payload });
    const err = new Error(`CLICK API error (${res.status})`);
    err.statusCode = 502;
    err.code = 'CLICK_API_ERROR';
    err.publicMessage = 'Payment provider error';
    err.meta = { status: res.status, payload };
    throw err;
  }

  logger.info('CLICK API response', { method, url, status: res.status, payload });
  return payload;
}

async function createInvoice({ amount, phoneNumber, merchantTransId }) {
  return clickApiRequest('POST', '/invoice/create', {
    json: {
      service_id: Number(config.click.serviceId),
      amount: Number(amount),
      phone_number: String(phoneNumber),
      merchant_trans_id: String(merchantTransId)
    }
  });
}

async function getInvoiceStatus({ invoiceId }) {
  return clickApiRequest(
    'GET',
    `/invoice/status/${encodeURIComponent(config.click.serviceId)}/${encodeURIComponent(invoiceId)}`
  );
}

async function getPaymentStatus({ paymentId }) {
  return clickApiRequest(
    'GET',
    `/payment/status/${encodeURIComponent(config.click.serviceId)}/${encodeURIComponent(paymentId)}`
  );
}

async function getPaymentStatusByMerchantTransId({ merchantTransId, createdAt }) {
  const day = toYYYYMMDD(createdAt);
  return clickApiRequest(
    'GET',
    `/payment/status_by_mti/${encodeURIComponent(config.click.serviceId)}/${encodeURIComponent(
      merchantTransId
    )}/${encodeURIComponent(day)}`
  );
}

async function reversePayment({ paymentId }) {
  return clickApiRequest(
    'DELETE',
    `/payment/reversal/${encodeURIComponent(config.click.serviceId)}/${encodeURIComponent(paymentId)}`
  );
}

module.exports = {
  buildClickPayUrl,
  createInvoice,
  getInvoiceStatus,
  getPaymentStatus,
  getPaymentStatusByMerchantTransId,
  reversePayment
};
