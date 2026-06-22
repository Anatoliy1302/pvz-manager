/**
 * PVZ team chat: rooms, members, messages (VPS PostgreSQL).
 * Support tickets stay on legacy table `chats` (/api/chats).
 */

function generalRoomId(pvzId) {
  return `general_${pvzId}`;
}

function privateRoomId(userIdA, userIdB, pvzId) {
  const [a, b] = [String(userIdA), String(userIdB)].sort();
  return `private_${a}_${b}_${pvzId}`;
}

async function initChatSchema(pool) {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pvz_id UUID REFERENCES pvz_points(id) ON DELETE SET NULL;
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      pvz_id UUID NOT NULL REFERENCES pvz_points(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('general', 'private')),
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_rooms_pvz_id_idx ON chat_rooms (pvz_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx
      ON chat_messages (room_id, created_at);

    CREATE TABLE IF NOT EXISTS chat_members (
      room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_read_at TIMESTAMP,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      display_name TEXT,
      PRIMARY KEY (room_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id);
  `);
}

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

async function canAccessPvz(pool, userId, pvzId) {
  const allowed = await readUserPvzIds(pool, userId);
  if (allowed.has(pvzId)) return true;

  const { rows: pvzRows } = await pool.query(
    'SELECT owner_id FROM pvz_points WHERE id = $1',
    [pvzId]
  );
  const ownerId = pvzRows[0]?.owner_id;
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

async function isRoomMember(pool, roomId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM chat_members WHERE room_id = $1 AND user_id = $2 AND hidden = FALSE',
    [roomId, userId]
  );
  return rows.length > 0;
}

async function requireRoomAccess(pool, userId, roomId) {
  const { rows } = await pool.query(
    'SELECT id, pvz_id, type, name FROM chat_rooms WHERE id = $1',
    [roomId]
  );
  const room = rows[0];
  if (!room) return { error: 'Room not found', status: 404 };

  const hasPvz = await canAccessPvz(pool, userId, room.pvz_id);
  if (!hasPvz) return { error: 'Forbidden', status: 403 };

  const member = await isRoomMember(pool, roomId, userId);
  if (!member) return { error: 'Not a member', status: 403 };

  return { room };
}

function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function fetchLastMessages(pool, roomIds) {
  if (!roomIds.length) return new Map();

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (room_id)
       room_id, text, user_id, user_name, created_at
     FROM chat_messages
     WHERE room_id = ANY($1::text[])
     ORDER BY room_id, created_at DESC`,
    [roomIds]
  );

  return new Map(rows.map((r) => [r.room_id, r]));
}

async function roomToSummary(pool, room, userId, lastByRoom, memberRow, participants) {
  const last = lastByRoom.get(room.id);
  const otherParticipant = room.type === 'private'
    ? participants.find((p) => p.user_id !== userId)
    : null;

  return {
    id: room.id,
    pvz_id: room.pvz_id,
    type: room.type,
    name:
      room.type === 'private'
        ? memberRow?.display_name || otherParticipant?.display_name || otherParticipant?.user_name || room.name
        : room.name,
    avatar: room.type === 'general' ? '🏪' : '👤',
    last_message: last?.text ?? '',
    last_message_time: last ? formatTime(last.created_at) : '',
    last_message_user_id: last?.user_id ?? undefined,
    unread_count: memberRow?.unread_count ?? 0,
    participants: participants.map((p) => p.user_id),
    participant_names: participants.map((p) => p.display_name || p.user_name || ''),
  };
}

function registerChatRoutes(app, pool, authMiddleware) {
  app.get('/api/chat/rooms', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.query.pvz_id ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvz_id required' });

      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { rows: rooms } = await pool.query(
        `SELECT r.*
         FROM chat_rooms r
         INNER JOIN chat_members m ON m.room_id = r.id AND m.user_id = $1 AND m.hidden = FALSE
         WHERE r.pvz_id = $2
         ORDER BY r.type ASC, r.created_at ASC`,
        [req.user.id, pvzId]
      );

      const roomIds = rooms.map((r) => r.id);
      const lastByRoom = await fetchLastMessages(pool, roomIds);

      const summaries = [];
      for (const room of rooms) {
        const { rows: members } = await pool.query(
          `SELECT cm.user_id, cm.unread_count, cm.display_name, u.name AS user_name
           FROM chat_members cm
           LEFT JOIN users u ON u.id = cm.user_id
           WHERE cm.room_id = $1 AND cm.hidden = FALSE`,
          [room.id]
        );
        const memberRow = members.find((m) => m.user_id === req.user.id);
        summaries.push(
          await roomToSummary(pool, room, req.user.id, lastByRoom, memberRow, members)
        );
      }

      res.json(summaries);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/rooms/general', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.body.pvz_id ?? '').trim();
      const name = String(req.body.name ?? 'Общий чат ПВЗ').trim() || 'Общий чат ПВЗ';
      if (!pvzId) return res.status(400).json({ error: 'pvz_id required' });
      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const roomId = generalRoomId(pvzId);
      await pool.query(
        `INSERT INTO chat_rooms (id, pvz_id, type, name)
         VALUES ($1, $2, 'general', $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [roomId, pvzId, name]
      );
      await pool.query(
        `INSERT INTO chat_members (room_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (room_id, user_id) DO UPDATE SET hidden = FALSE`,
        [roomId, req.user.id]
      );

      res.json({ id: roomId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/rooms/private', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.body.pvz_id ?? '').trim();
      const otherUserId = String(req.body.other_user_id ?? '').trim();
      const otherUserName = String(req.body.other_user_name ?? '').trim() || 'Участник';
      const myName = String(req.body.my_name ?? '').trim() || 'Вы';

      if (!pvzId || !otherUserId) {
        return res.status(400).json({ error: 'pvz_id and other_user_id required' });
      }
      if (otherUserId === req.user.id) {
        return res.status(400).json({ error: 'Cannot chat with yourself' });
      }
      if (!(await canAccessPvz(pool, req.user.id, pvzId))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!(await canAccessPvz(pool, otherUserId, pvzId))) {
        return res.status(403).json({ error: 'Other user has no access to this PVZ' });
      }

      const roomId = privateRoomId(req.user.id, otherUserId, pvzId);
      const roomName = `${myName} · ${otherUserName}`;

      await pool.query(
        `INSERT INTO chat_rooms (id, pvz_id, type, name)
         VALUES ($1, $2, 'private', $3)
         ON CONFLICT (id) DO NOTHING`,
        [roomId, pvzId, roomName]
      );

      await pool.query(
        `INSERT INTO chat_members (room_id, user_id, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, user_id) DO UPDATE SET hidden = FALSE, display_name = EXCLUDED.display_name`,
        [roomId, req.user.id, otherUserName]
      );
      await pool.query(
        `INSERT INTO chat_members (room_id, user_id, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, user_id) DO UPDATE SET hidden = FALSE, display_name = EXCLUDED.display_name`,
        [roomId, otherUserId, myName]
      );

      res.json({ id: roomId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/rooms/:roomId/members/sync', authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.params;
      const access = await requireRoomAccess(pool, req.user.id, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (access.room.type !== 'general') {
        return res.status(400).json({ error: 'Only general rooms support member sync' });
      }

      const memberIds = Array.isArray(req.body.member_ids)
        ? req.body.member_ids.map((id) => String(id)).filter(Boolean)
        : [];

      for (const memberId of memberIds) {
        if (!(await canAccessPvz(pool, memberId, access.room.pvz_id))) continue;
        await pool.query(
          `INSERT INTO chat_members (room_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (room_id, user_id) DO UPDATE SET hidden = FALSE`,
          [roomId, memberId]
        );
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chat/rooms/:roomId/messages', authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.params;
      const access = await requireRoomAccess(pool, req.user.id, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });

      const after = req.query.after ? String(req.query.after) : null;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 500);

      const params = [roomId];
      let sql = `SELECT id, room_id, user_id, user_name, text, created_at
                 FROM chat_messages WHERE room_id = $1`;
      if (after) {
        params.push(after);
        sql += ` AND created_at > $2::timestamptz`;
      }
      sql += ` ORDER BY created_at ASC LIMIT ${limit}`;

      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/rooms/:roomId/messages', authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.params;
      const text = String(req.body.text ?? '').trim();
      const userName = String(req.body.user_name ?? req.user.email ?? 'Пользователь').trim();

      if (!text) return res.status(400).json({ error: 'text required' });

      const access = await requireRoomAccess(pool, req.user.id, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `INSERT INTO chat_messages (room_id, user_id, user_name, text)
           VALUES ($1, $2, $3, $4)
           RETURNING id, room_id, user_id, user_name, text, created_at`,
          [roomId, req.user.id, userName, text]
        );

        await client.query(
          `UPDATE chat_members
           SET unread_count = unread_count + 1
           WHERE room_id = $1 AND user_id <> $2 AND hidden = FALSE`,
          [roomId, req.user.id]
        );

        await client.query('COMMIT');
        res.status(201).json(rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/chat/rooms/:roomId/read', authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.params;
      const access = await requireRoomAccess(pool, req.user.id, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });

      await pool.query(
        `UPDATE chat_members
         SET unread_count = 0, last_read_at = NOW()
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, req.user.id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/chat/rooms/:roomId', authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.params;
      const access = await requireRoomAccess(pool, req.user.id, roomId);
      if (access.error) return res.status(access.status).json({ error: access.error });

      if (access.room.type === 'general') {
        return res.status(400).json({ error: 'Cannot delete general chat' });
      }

      await pool.query(
        `UPDATE chat_members SET hidden = TRUE, unread_count = 0
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, req.user.id]
      );

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM chat_members
         WHERE room_id = $1 AND hidden = FALSE`,
        [roomId]
      );
      if ((rows[0]?.count ?? 0) === 0) {
        await pool.query('DELETE FROM chat_rooms WHERE id = $1', [roomId]);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/chat/unread-total', authMiddleware, async (req, res) => {
    try {
      const pvzId = String(req.query.pvz_id ?? '').trim();
      if (!pvzId) return res.status(400).json({ error: 'pvz_id required' });

      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(cm.unread_count), 0)::int AS count
         FROM chat_members cm
         INNER JOIN chat_rooms r ON r.id = cm.room_id
         WHERE cm.user_id = $1 AND cm.hidden = FALSE AND r.pvz_id = $2`,
        [req.user.id, pvzId]
      );
      res.json({ count: rows[0]?.count ?? 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

async function deleteUserChatData(pool, userId, client = pool) {
  await client.query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM chat_members WHERE user_id = $1', [userId]);
}

module.exports = {
  initChatSchema,
  registerChatRoutes,
  deleteUserChatData,
  generalRoomId,
  privateRoomId,
};
