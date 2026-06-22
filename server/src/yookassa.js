const YOOKASSA_API = 'https://api.yookassa.ru/v3';

function getCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) {
    throw new Error('YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY должны быть заданы в server/.env');
  }
  return { shopId, secretKey };
}

function authHeader() {
  const { shopId, secretKey } = getCredentials();
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

function formatAmount(rub) {
  return Number(rub).toFixed(2);
}

function isYooKassaTestMode() {
  const value = process.env.YOOKASSA_TEST_MODE?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

async function postPayment(payload, idempotenceKey) {
  const response = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) {
    const message = body.description || `YooKassa HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function createYooKassaPayment({
  amountRub,
  description,
  returnUrl,
  metadata,
  idempotenceKey,
  test,
  savePaymentMethod,
}) {
  const payload = {
    amount: { value: formatAmount(amountRub), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description,
    metadata,
  };
  if (savePaymentMethod) payload.save_payment_method = true;
  if (test) payload.test = true;
  return postPayment(payload, idempotenceKey);
}

async function fetchYooKassaPayment(paymentId) {
  const response = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const message = body.description || `YooKassa HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

module.exports = {
  createYooKassaPayment,
  fetchYooKassaPayment,
  isYooKassaTestMode,
};
