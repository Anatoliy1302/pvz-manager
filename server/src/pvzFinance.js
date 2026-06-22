const { mergeSyncSnapshotPayload } = require('./snapshotMerge');
const { canAccessPvz, canManagePvz, readOwnerSnapshotPayload } = require('./pvzAccess');

function readSalaryBundle(payload, pvzId) {
  const fromBundle = payload.salary_bundles?.[pvzId];
  if (fromBundle && typeof fromBundle === 'object') {
    return {
      global: fromBundle.global ?? null,
      formulas: Array.isArray(fromBundle.formulas) ? fromBundle.formulas : [],
      employeeRates:
        fromBundle.employeeRates && typeof fromBundle.employeeRates === 'object'
          ? fromBundle.employeeRates
          : {},
    };
  }

  return {
    global: payload.global_salary_settings_by_pvz?.[pvzId] ?? null,
    formulas: Array.isArray(payload.salary_formulas_by_pvz?.[pvzId])
      ? payload.salary_formulas_by_pvz[pvzId]
      : [],
    employeeRates:
      payload.salary_settings_by_pvz?.[pvzId] &&
      typeof payload.salary_settings_by_pvz[pvzId] === 'object'
        ? payload.salary_settings_by_pvz[pvzId]
        : {},
  };
}

function readEmployeeSettingsForPvz(payload, pvzId) {
  const map = payload.employee_salary_settings;
  if (!map || typeof map !== 'object') return {};

  const prefix = `${pvzId}:`;
  const result = {};
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = value;
    }
  }
  return result;
}

function paymentBelongsToPvz(payment, pvzId) {
  return String(payment?.pvzId ?? payment?.pvz_id ?? '') === String(pvzId);
}

function upsertSnapshotArrayItem(existing, key, item, maxItems = 500) {
  const arr = Array.isArray(existing[key]) ? [...existing[key]] : [];
  const id = item?.id != null ? String(item.id) : '';
  if (!id) return existing;
  const idx = arr.findIndex((entry) => String(entry?.id) === id);
  if (idx >= 0) arr[idx] = item;
  else arr.unshift(item);
  return mergeSyncSnapshotPayload(existing, { [key]: arr.slice(0, maxItems) });
}

function deleteSnapshotArrayItem(existing, key, itemId) {
  const arr = Array.isArray(existing[key])
    ? existing[key].filter((entry) => String(entry?.id) !== String(itemId))
    : [];
  return mergeSyncSnapshotPayload(existing, { [key]: arr });
}

async function writeOwnerSnapshot(pool, ownerId, payload) {
  await pool.query(
    `INSERT INTO sync_snapshots (user_id, payload, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [ownerId, payload]
  );
}

function registerPvzFinanceRoutes(app, pool, authMiddleware) {
  app.get('/api/pvz/:pvzId/salary', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvzId required' });
      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { payload } = await readOwnerSnapshotPayload(pool, pvzId);
      res.json({
        bundle: readSalaryBundle(payload, pvzId),
        employeeSettings: readEmployeeSettingsForPvz(payload, pvzId),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/pvz/:pvzId/salary', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvzId required' });
      if (!(await canManagePvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const patch = {};
      const bundle = req.body.bundle;
      if (bundle && typeof bundle === 'object') {
        patch.salary_bundles = { [pvzId]: bundle };
        if (bundle.global !== undefined) {
          patch.global_salary_settings_by_pvz = { [pvzId]: bundle.global };
        }
        if (Array.isArray(bundle.formulas)) {
          patch.salary_formulas_by_pvz = { [pvzId]: bundle.formulas };
        }
        if (bundle.employeeRates && typeof bundle.employeeRates === 'object') {
          patch.salary_settings_by_pvz = { [pvzId]: bundle.employeeRates };
        }
      }

      const employeeSettings = req.body.employeeSettings;
      if (employeeSettings && typeof employeeSettings === 'object') {
        const empPatch = {};
        for (const [employeeId, settings] of Object.entries(employeeSettings)) {
          empPatch[`${pvzId}:${employeeId}`] = settings;
        }
        const currentEmp =
          existing.employee_salary_settings &&
          typeof existing.employee_salary_settings === 'object'
            ? { ...existing.employee_salary_settings }
            : {};
        patch.employee_salary_settings = { ...currentEmp, ...empPatch };
      }

      const merged = mergeSyncSnapshotPayload(existing, patch);
      await pool.query(
        `INSERT INTO sync_snapshots (user_id, payload, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [ownerId, merged]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pvz/:pvzId/finance', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvzId required' });
      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { payload } = await readOwnerSnapshotPayload(pool, pvzId);
      const payments = (Array.isArray(payload.payments) ? payload.payments : []).filter((p) =>
        paymentBelongsToPvz(p, pvzId)
      );
      const advanceRequests = (
        Array.isArray(payload.advance_requests) ? payload.advance_requests : []
      ).filter((r) => paymentBelongsToPvz(r, pvzId));

      const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
      const pvzEmployeeIds = new Set(
        profiles
          .filter(
            (p) =>
              String(p.pvzId ?? p.pvz_id ?? '') === pvzId ||
              (Array.isArray(p.pvzIds) && p.pvzIds.includes(pvzId)) ||
              (Array.isArray(p.pvz_ids) && p.pvz_ids.includes(pvzId))
          )
          .map((p) => String(p.id))
      );

      const penalties = (Array.isArray(payload.penalties) ? payload.penalties : []).filter((p) =>
        pvzEmployeeIds.has(String(p.employeeId ?? p.employee_id ?? ''))
      );

      res.json({ payments, penalties, advance_requests: advanceRequests });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/pvz/:pvzId/payments', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      const payment = req.body;
      if (!pvzId || !payment || typeof payment !== 'object') {
        return res.status(400).json({ error: 'pvzId and payment required' });
      }
      if (!(await canManagePvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const normalized = { ...payment, pvzId: String(payment.pvzId ?? pvzId) };
      const merged = upsertSnapshotArrayItem(existing, 'payments', normalized);
      await writeOwnerSnapshot(pool, ownerId, merged);
      res.json({ success: true, payment: normalized });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/pvz/:pvzId/penalties', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      const penalty = req.body;
      if (!pvzId || !penalty || typeof penalty !== 'object') {
        return res.status(400).json({ error: 'pvzId and penalty required' });
      }
      if (!(await canManagePvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const normalized = { ...penalty, pvzId: String(penalty.pvzId ?? pvzId) };
      const merged = upsertSnapshotArrayItem(existing, 'penalties', normalized);
      await writeOwnerSnapshot(pool, ownerId, merged);
      res.json({ success: true, penalty: normalized });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/pvz/:pvzId/penalties/:penaltyId', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      const penaltyId = String(req.params.penaltyId ?? '').trim();
      if (!pvzId || !penaltyId) {
        return res.status(400).json({ error: 'pvzId and penaltyId required' });
      }
      if (!(await canManagePvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const merged = deleteSnapshotArrayItem(existing, 'penalties', penaltyId);
      await writeOwnerSnapshot(pool, ownerId, merged);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/pvz/:pvzId/advance-requests', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      const request = req.body;
      if (!pvzId || !request || typeof request !== 'object') {
        return res.status(400).json({ error: 'pvzId and advance request required' });
      }

      const canManage = await canManagePvz(pool, req.user.id, pvzId);
      const canSubmit =
        !canManage &&
        (await canAccessPvz(pool, req.user.id, pvzId)) &&
        String(request.employeeId ?? request.employee_id ?? '') === String(req.user.id);

      if (!canManage && !canSubmit) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const normalized = { ...request, pvzId: String(request.pvzId ?? pvzId) };
      const merged = upsertSnapshotArrayItem(existing, 'advance_requests', normalized);
      await writeOwnerSnapshot(pool, ownerId, merged);
      res.json({ success: true, request: normalized });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerPvzFinanceRoutes };
