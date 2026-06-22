/** Shared PVZ access checks for chat, schedule, etc. */

async function readUserPvzIds(pool, userId) {
  const ids = new Set();

  const { rows: userRows } = await pool.query(
    'SELECT role, pvz_id FROM users WHERE id = $1',
    [userId]
  );
  const user = userRows[0];
  if (!user) return ids;

  const { rows: owned } = await pool.query(
    'SELECT id FROM pvz_points WHERE owner_id = $1',
    [userId]
  );
  owned.forEach((r) => ids.add(r.id));

  if (user.pvz_id) ids.add(user.pvz_id);

  const { rows: snapRows } = await pool.query(
    'SELECT payload FROM sync_snapshots WHERE user_id = $1',
    [userId]
  );
  const profile = snapRows[0]?.payload?.profiles?.[userId];
  if (profile?.pvzId) ids.add(profile.pvzId);
  if (Array.isArray(profile?.pvzIds)) {
    profile.pvzIds.forEach((id) => ids.add(id));
  }

  return ids;
}

async function getPvzOwnerId(pool, pvzId) {
  const { rows } = await pool.query('SELECT owner_id FROM pvz_points WHERE id = $1', [pvzId]);
  return rows[0]?.owner_id ?? null;
}

async function canAccessPvz(pool, userId, pvzId) {
  const allowed = await readUserPvzIds(pool, userId);
  if (allowed.has(pvzId)) return true;

  const ownerId = await getPvzOwnerId(pool, pvzId);
  if (!ownerId) return false;

  const { rows: ownerSnap } = await pool.query(
    'SELECT payload FROM sync_snapshots WHERE user_id = $1',
    [ownerId]
  );
  const profiles = ownerSnap.rows[0]?.payload?.profiles;
  if (!profiles || typeof profiles !== 'object') return false;

  const entry = profiles[userId];
  if (!entry) return false;
  if (entry.pvzId === pvzId) return true;
  if (Array.isArray(entry.pvzIds) && entry.pvzIds.includes(pvzId)) return true;
  return false;
}

async function canManagePvz(pool, userId, pvzId) {
  const ownerId = await getPvzOwnerId(pool, pvzId);
  if (ownerId && ownerId === userId) return true;

  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  const role = rows[0]?.role;
  if (role === 'admin' && (await canAccessPvz(pool, userId, pvzId))) return true;
  return false;
}

async function readOwnerSnapshotPayload(pool, pvzId) {
  const ownerId = await getPvzOwnerId(pool, pvzId);
  if (!ownerId) return { ownerId: null, payload: {} };

  const { rows } = await pool.query(
    'SELECT payload FROM sync_snapshots WHERE user_id = $1',
    [ownerId]
  );
  const payload = rows[0]?.payload;
  return {
    ownerId,
    payload: payload && typeof payload === 'object' ? payload : {},
  };
}

module.exports = {
  readUserPvzIds,
  getPvzOwnerId,
  canAccessPvz,
  canManagePvz,
  readOwnerSnapshotPayload,
};
