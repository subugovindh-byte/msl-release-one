import { getDb } from '../db/connection.js';

/**
 * Record an action to the audit log.
 * Must be called inside a route handler where req is available.
 */
export function audit(req, action, tableName, recordId, before, after) {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (user_id, username, action, table_name, record_id, before_json, after_json, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user?.id || null,
    req.user?.username || null,
    action,
    tableName,
    String(recordId),
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    req.ip || null,
    req.headers['user-agent'] || null,
  );
}

/**
 * Query audit log with filters.
 */
export function queryAudit({ userId, action, tableName, recordId, from, to, limit = 100 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
  if (action) { sql += ' AND action = ?'; params.push(action); }
  if (tableName) { sql += ' AND table_name = ?'; params.push(tableName); }
  if (recordId) { sql += ' AND record_id = ?'; params.push(String(recordId)); }
  if (from) { sql += ' AND ts >= ?'; params.push(from); }
  if (to) { sql += ' AND ts <= ?'; params.push(to); }

  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}
