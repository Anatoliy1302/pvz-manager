const { mergeSyncSnapshotPayload } = require('./snapshotMerge');
const { canAccessPvz, canManagePvz, readOwnerSnapshotPayload } = require('./pvzAccess');

function shiftBelongsToPvz(shift, pvzId) {
  if (!shift || typeof shift !== 'object') return false;
  const id = shift.pvzId ?? shift.pvz_id;
  return String(id) === String(pvzId);
}

function registerScheduleRoutes(app, pool, authMiddleware) {
  app.get('/api/pvz/:pvzId/schedule', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvzId required' });

      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { payload } = await readOwnerSnapshotPayload(pool, pvzId);
      const scheduleMap = payload.schedule_assignments_by_pvz;
      const assignments =
        scheduleMap && typeof scheduleMap === 'object' && Array.isArray(scheduleMap[pvzId])
          ? scheduleMap[pvzId]
          : [];

      const allShifts = Array.isArray(payload.shifts) ? payload.shifts : [];
      const shifts = allShifts.filter((s) => shiftBelongsToPvz(s, pvzId));

      res.json({ assignments, shifts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/pvz/:pvzId/schedule', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.params.pvzId ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvzId required' });

      if (!(await canManagePvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { ownerId, payload: existing } = await readOwnerSnapshotPayload(pool, pvzId);
      if (!ownerId) return res.status(404).json({ error: 'PVZ not found' });

      const patch = {};
      if (Array.isArray(req.body.assignments)) {
        patch.schedule_assignments_by_pvz = { [pvzId]: req.body.assignments };
      }

      if (Array.isArray(req.body.shifts)) {
        const otherShifts = (Array.isArray(existing.shifts) ? existing.shifts : []).filter(
          (s) => !shiftBelongsToPvz(s, pvzId)
        );
        patch.shifts = [...otherShifts, ...req.body.shifts];
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
}

module.exports = { registerScheduleRoutes };
