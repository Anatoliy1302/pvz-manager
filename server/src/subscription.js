const crypto = require('crypto');
const {
  createYooKassaPayment,
  fetchYooKassaPayment,
  isYooKassaTestMode,
} = require('./yookassa');

const PRO_PVZ_LIMIT = 999;
const PRO_EMPLOYEE_LIMIT = 999;
const FREE_PVZ_LIMIT = 1;
const FREE_EMPLOYEE_LIMIT = 5;
const PRO_MONTHLY_RUB = 399;
const PRO_YEARLY_RUB = 3990;
const PRO_MONTHLY_DAYS = 30;
const PRO_YEARLY_DAYS = 365;
const PRODUCT_ID = 'subscription_pro';
const PRODUCT_NAME = 'Подписка Pro';

async function initSubscriptionSchema(pool) {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_early_adopter BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS early_adopter_ends_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pvz_limit INTEGER DEFAULT ${FREE_PVZ_LIMIT};
    ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_limit INTEGER DEFAULT ${FREE_EMPLOYEE_LIMIT};
    ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_autopay_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS yookassa_payment_method_id TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'yookassa',
      provider_payment_id TEXT NOT NULL,
      amount_rub INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'canceled', 'failed')),
      tier TEXT NOT NULL DEFAULT 'pro',
      pvz_count INTEGER NOT NULL DEFAULT 1,
      payment_kind TEXT NOT NULL DEFAULT 'initial',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (provider, provider_payment_id)
    );
    CREATE INDEX IF NOT EXISTS subscription_payments_user_id_idx
      ON subscription_payments (user_id, created_at DESC);
  `);
}

function userRowToSubscription(row, hasSuccessfulPayment) {
  return {
    tier: row.subscription_tier || 'free',
    status: row.subscription_status || 'active',
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    subscriptionPeriodEndsAt: row.subscription_period_ends_at
      ? new Date(row.subscription_period_ends_at).toISOString()
      : null,
    hasSuccessfulPayment: Boolean(hasSuccessfulPayment),
    subscriptionAutopayEnabled: Boolean(row.subscription_autopay_enabled),
    isEarlyAdopter: Boolean(row.is_early_adopter),
    earlyAdopterEndsAt: row.early_adopter_ends_at
      ? new Date(row.early_adopter_ends_at).toISOString()
      : null,
    pvzLimit: row.pvz_limit ?? FREE_PVZ_LIMIT,
    employeeLimit: row.employee_limit ?? FREE_EMPLOYEE_LIMIT,
  };
}

async function loadUserSubscription(pool, userId) {
  const { rows } = await pool.query(
    `SELECT u.*,
      EXISTS(
        SELECT 1 FROM subscription_payments sp
        WHERE sp.user_id = u.id AND sp.status = 'succeeded'
      ) AS has_successful_payment
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!rows[0]) return null;
  return userRowToSubscription(rows[0], rows[0].has_successful_payment);
}

async function writeSubscriptionToSnapshot(pool, userId, subscription) {
  const { rows } = await pool.query(
    'SELECT payload FROM sync_snapshots WHERE user_id = $1',
    [userId]
  );
  const payload = rows[0]?.payload && typeof rows[0].payload === 'object' ? rows[0].payload : {};
  const subscriptions =
    payload.subscriptions && typeof payload.subscriptions === 'object' && !Array.isArray(payload.subscriptions)
      ? { ...payload.subscriptions }
      : {};
  subscriptions[userId] = subscription;

  await pool.query(
    `INSERT INTO sync_snapshots (user_id, payload, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET payload = sync_snapshots.payload || $2::jsonb, updated_at = NOW()`,
    [userId, JSON.stringify({ subscriptions })]
  );
}

async function enrichSyncSnapshot(pool, userId, snapshotPayload) {
  const subscription = await loadUserSubscription(pool, userId);
  if (!subscription) return snapshotPayload;

  const subscriptions =
    snapshotPayload?.subscriptions &&
    typeof snapshotPayload.subscriptions === 'object' &&
    !Array.isArray(snapshotPayload.subscriptions)
      ? { ...snapshotPayload.subscriptions }
      : {};

  subscriptions[userId] = subscription;
  return { ...snapshotPayload, subscriptions };
}

function getBillingConfig(billingPeriod) {
  if (billingPeriod === 'year') {
    return { amountRub: PRO_YEARLY_RUB, periodDays: PRO_YEARLY_DAYS, label: 'год' };
  }
  return { amountRub: PRO_MONTHLY_RUB, periodDays: PRO_MONTHLY_DAYS, label: 'месяц' };
}

function buildDescription(billingPeriod, paymentKind, testMode) {
  const prefix = testMode ? '[TEST] ' : '';
  const action = paymentKind === 'renewal' ? 'Продление' : 'Подписка';
  const periodLabel = billingPeriod === 'year' ? '12 мес.' : '30 дн.';
  return `${prefix}${action} ${PRODUCT_NAME}, ${periodLabel}`;
}

function buildMetadata(userId, billingPeriod, paymentKind, amountRub, periodDays, testMode) {
  return {
    user_id: userId,
    tier: 'pro',
    product_id: PRODUCT_ID,
    product_name: PRODUCT_NAME,
    billing_period: billingPeriod,
    period_days: String(periodDays),
    payment_kind: paymentKind,
    amount_rub: String(amountRub),
    recurring: 'true',
    is_test: testMode ? 'true' : 'false',
  };
}

async function activateProFromPayment(pool, providerPaymentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM subscription_payments
       WHERE provider = 'yookassa' AND provider_payment_id = $1
       FOR UPDATE`,
      [providerPaymentId]
    );
    const pay = rows[0];
    if (!pay) {
      await client.query('ROLLBACK');
      return false;
    }
    if (pay.status === 'succeeded') {
      await client.query('COMMIT');
      return true;
    }
    if (pay.status !== 'pending') {
      await client.query('ROLLBACK');
      return false;
    }

    const periodDays =
      Number.parseInt(pay.metadata?.period_days, 10) ||
      (pay.metadata?.billing_period === 'year' ? PRO_YEARLY_DAYS : PRO_MONTHLY_DAYS);

    await client.query(
      `UPDATE subscription_payments
       SET status = 'succeeded', paid_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [pay.id]
    );

    const userRes = await client.query(
      'SELECT subscription_period_ends_at FROM users WHERE id = $1',
      [pay.user_id]
    );
    const currentEnd = userRes.rows[0]?.subscription_period_ends_at;
    const newEnd = new Date();
    if (currentEnd && new Date(currentEnd) > newEnd) {
      newEnd.setTime(new Date(currentEnd).getTime());
    }
    newEnd.setDate(newEnd.getDate() + periodDays);

    await client.query(
      `UPDATE users SET
         subscription_tier = 'pro',
         subscription_status = 'active',
         pvz_limit = $2,
         employee_limit = $3,
         subscription_period_ends_at = $4
       WHERE id = $1 AND role = 'owner'`,
      [pay.user_id, PRO_PVZ_LIMIT, PRO_EMPLOYEE_LIMIT, newEnd]
    );

    await client.query('COMMIT');

    const subscription = await loadUserSubscription(pool, pay.user_id);
    if (subscription) {
      await writeSubscriptionToSnapshot(pool, pay.user_id, subscription);
    }
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function savePaymentMethodIfPresent(pool, payment) {
  const userId = payment.metadata?.user_id;
  const methodId = payment.payment_method?.id;
  const saved = payment.payment_method?.saved;
  if (!userId || !methodId || !saved) return;

  await pool.query(
    `UPDATE users SET
       yookassa_payment_method_id = $2,
       subscription_autopay_enabled = TRUE
     WHERE id = $1 AND role = 'owner'`,
    [userId, methodId]
  );

  const subscription = await loadUserSubscription(pool, userId);
  if (subscription) {
    subscription.subscriptionAutopayEnabled = true;
    await writeSubscriptionToSnapshot(pool, userId, subscription);
  }
}

async function ensurePaymentRecord(pool, payment) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM subscription_payments
     WHERE provider = 'yookassa' AND provider_payment_id = $1`,
    [payment.id]
  );
  if (existing.length > 0) return;

  const userId = payment.metadata?.user_id;
  if (!userId) {
    throw new Error(`Payment ${payment.id} missing user_id in metadata`);
  }

  const amountRub = Math.round(Number.parseFloat(payment.amount.value));
  const paymentKind = payment.metadata?.payment_kind || 'autopay';
  const pvzCount = Number.parseInt(payment.metadata?.pvz_count || '1', 10) || 1;

  await pool.query(
    `INSERT INTO subscription_payments (
       user_id, provider, provider_payment_id, amount_rub, currency, status,
       tier, pvz_count, payment_kind, metadata
     ) VALUES ($1, 'yookassa', $2, $3, $4, 'pending', 'pro', $5, $6, $7)`,
    [
      userId,
      payment.id,
      amountRub,
      payment.amount.currency || 'RUB',
      pvzCount,
      paymentKind,
      JSON.stringify(payment.metadata || {}),
    ]
  );
}

async function processYooKassaPayment(pool, paymentId) {
  const payment = await fetchYooKassaPayment(paymentId);
  if (payment.status !== 'succeeded' || !payment.paid) {
    return { ok: true, activated: false, status: payment.status, paid: payment.paid };
  }

  const isTestPayment = Boolean(payment.test);
  const serverTestMode = isYooKassaTestMode();
  if (isTestPayment && !serverTestMode) {
    return { ok: true, activated: false, ignored: true, reason: 'test_payment_in_production' };
  }

  await ensurePaymentRecord(pool, payment);
  const activated = await activateProFromPayment(pool, payment.id);
  await savePaymentMethodIfPresent(pool, payment);

  return { ok: true, activated, paymentId: payment.id };
}

function registerSubscriptionRoutes(app, pool, authMiddleware) {
  app.post('/api/subscription/create-payment', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const { rows: users } = await pool.query(
        'SELECT id, role, subscription_tier, subscription_status FROM users WHERE id = $1',
        [userId]
      );
      const user = users[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can purchase Pro subscription' });
      }
      if (user.subscription_tier === 'enterprise' && user.subscription_status === 'active') {
        return res.status(400).json({ error: 'Enterprise subscription is already active' });
      }

      const billingPeriod = req.body?.billingPeriod === 'year' ? 'year' : 'month';
      const paymentKind =
        req.body?.paymentKind === 'renewal' ? 'renewal' : 'initial';

      const { rows: paidRows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM subscription_payments
         WHERE user_id = $1 AND status = 'succeeded'`,
        [userId]
      );
      const resolvedKind =
        paymentKind === 'renewal' || paidRows[0].count > 0 ? 'renewal' : 'initial';

      const { rows: pvzRows } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM pvz_points WHERE owner_id = $1',
        [userId]
      );
      const pvzCount = Math.max(pvzRows[0].count, 1);

      const billing = getBillingConfig(billingPeriod);
      const returnUrl =
        req.body?.returnUrl?.trim() ||
        process.env.YOOKASSA_RETURN_URL ||
        'pvzpersonal://payment/success';
      const testMode = isYooKassaTestMode();
      const idempotenceKey = crypto.randomUUID();
      const description = buildDescription(billingPeriod, resolvedKind, testMode);

      const payment = await createYooKassaPayment({
        amountRub: billing.amountRub,
        description,
        returnUrl,
        test: testMode,
        savePaymentMethod: true,
        metadata: buildMetadata(
          userId,
          billingPeriod,
          resolvedKind,
          billing.amountRub,
          billing.periodDays,
          testMode
        ),
        idempotenceKey,
      });

      const confirmationUrl = payment.confirmation?.confirmation_url;
      if (!confirmationUrl) {
        throw new Error('YooKassa did not return confirmation_url');
      }

      await pool.query(
        `INSERT INTO subscription_payments (
           user_id, provider, provider_payment_id, amount_rub, currency, status,
           tier, pvz_count, payment_kind, metadata
         ) VALUES ($1, 'yookassa', $2, $3, 'RUB', 'pending', 'pro', $4, $5, $6)`,
        [
          userId,
          payment.id,
          billing.amountRub,
          pvzCount,
          resolvedKind,
          JSON.stringify({
            billing_period: billingPeriod,
            period_days: billing.periodDays,
            return_url: returnUrl,
            is_test: testMode,
            recurring: true,
          }),
        ]
      );

      res.json({
        confirmationUrl,
        paymentId: payment.id,
        amountRub: billing.amountRub,
        pvzCount,
        pricePerPvz: billing.amountRub,
        paymentKind: resolvedKind,
        periodDays: billing.periodDays,
        billingPeriod,
        savePaymentMethod: true,
        pvzLimit: PRO_PVZ_LIMIT,
        employeeLimit: PRO_EMPLOYEE_LIMIT,
        testMode,
        isTestPayment: Boolean(payment.test),
      });
    } catch (err) {
      console.error('create-payment error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/subscription/cancel', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const { rows } = await pool.query(
        `SELECT id, role, subscription_tier, subscription_status,
                subscription_period_ends_at, subscription_autopay_enabled
         FROM users WHERE id = $1`,
        [userId]
      );
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.role !== 'owner') {
        return res.status(403).json({ error: 'Only owners can cancel subscription' });
      }
      if (user.subscription_tier !== 'pro') {
        return res.status(400).json({ error: 'No active Pro subscription to cancel' });
      }
      if (user.subscription_status === 'canceled') {
        return res.json({
          ok: true,
          alreadyCanceled: true,
          subscriptionPeriodEndsAt: user.subscription_period_ends_at
            ? new Date(user.subscription_period_ends_at).toISOString()
            : null,
        });
      }

      await pool.query(
        `UPDATE users SET
           subscription_status = 'canceled',
           subscription_autopay_enabled = FALSE,
           yookassa_payment_method_id = NULL
         WHERE id = $1 AND role = 'owner'`,
        [userId]
      );

      const subscription = await loadUserSubscription(pool, userId);
      if (subscription) {
        subscription.status = 'canceled';
        subscription.subscriptionAutopayEnabled = false;
        await writeSubscriptionToSnapshot(pool, userId, subscription);
      }

      res.json({
        ok: true,
        canceled: true,
        autopayDisabled: true,
        subscriptionPeriodEndsAt: user.subscription_period_ends_at
          ? new Date(user.subscription_period_ends_at).toISOString()
          : null,
      });
    } catch (err) {
      console.error('cancel-subscription error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** Проверка статуса платежа после возврата из браузера (если webhook задержался) */
  app.post('/api/subscription/sync-payment', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const paymentId = req.body?.paymentId?.trim();

      let targetPaymentId = paymentId;
      if (!targetPaymentId) {
        const { rows } = await pool.query(
          `SELECT provider_payment_id FROM subscription_payments
           WHERE user_id = $1 AND status = 'pending'
           ORDER BY created_at DESC LIMIT 1`,
          [userId]
        );
        targetPaymentId = rows[0]?.provider_payment_id;
      }

      if (!targetPaymentId) {
        return res.json({ ok: true, activated: false, reason: 'no_pending_payment' });
      }

      const result = await processYooKassaPayment(pool, targetPaymentId);
      const subscription = await loadUserSubscription(pool, userId);
      res.json({ ...result, subscription });
    } catch (err) {
      console.error('sync-payment error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** Webhook ЮKassa — настроить URL: https://api.pvzpersonal.ru/api/subscription/webhook */
  app.post('/api/subscription/webhook', async (req, res) => {
    try {
      const paymentId = req.body?.object?.id;
      const event = req.body?.event || '';

      if (!paymentId) {
        return res.status(400).json({ error: 'Missing payment id' });
      }
      if (event !== 'payment.succeeded' && event !== 'payment.waiting_for_capture') {
        return res.json({ ok: true, ignored: true, event });
      }

      const result = await processYooKassaPayment(pool, paymentId);
      res.json(result);
    } catch (err) {
      console.error('payment-webhook error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = {
  initSubscriptionSchema,
  enrichSyncSnapshot,
  registerSubscriptionRoutes,
  loadUserSubscription,
};
