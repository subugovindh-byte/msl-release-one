-- ─── Roles ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT
);

-- ─── Permissions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  resource    TEXT NOT NULL,
  action      TEXT NOT NULL,
  description TEXT,
  UNIQUE(resource, action)
);

-- ─── Role ↔ Permission ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ─── User ↔ Role ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- ─── Seed permissions ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO permissions (resource, action, description) VALUES
  ('pos',       'read',   'View POS module'),
  ('pos',       'write',  'Create POS transactions'),
  ('inventory', 'read',   'View inventory and slabs'),
  ('inventory', 'write',  'Manage inventory and slabs'),
  ('invoices',  'read',   'View invoices'),
  ('invoices',  'write',  'Create and edit invoices'),
  ('invoices',  'delete', 'Delete or cancel invoices'),
  ('purchases', 'read',   'View purchase orders'),
  ('purchases', 'write',  'Create and edit purchase orders'),
  ('payments',  'read',   'View payments'),
  ('payments',  'write',  'Record payments'),
  ('payroll',   'read',   'View payroll'),
  ('payroll',   'write',  'Process payroll'),
  ('reports',   'read',   'View all reports'),
  ('users',     'manage', 'Manage users and roles'),
  ('settings',  'manage', 'Manage system settings');

-- ─── Seed system roles ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO roles (name, description, is_system) VALUES
  ('admin',    'Full system access — all modules and settings',              1),
  ('accounts', 'Finance: invoices, payments, payroll, GST, reports',        1),
  ('sales',    'POS, invoices, customers, payments (read)',                  1),
  ('yard',     'Inventory, production, slabs, purchase orders (read)',       1);

-- admin → all permissions
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- accounts → invoices rw, payments rw, payroll rw, reports r, pos r
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
     (p.resource IN ('invoices','payments','payroll') AND p.action IN ('read','write'))
  OR (p.resource = 'reports'  AND p.action = 'read')
  OR (p.resource = 'pos'      AND p.action = 'read')
) WHERE r.name = 'accounts';

-- sales → pos rw, invoices rw, payments r, reports r
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
     (p.resource = 'pos'      AND p.action IN ('read','write'))
  OR (p.resource = 'invoices' AND p.action IN ('read','write'))
  OR (p.resource = 'payments' AND p.action = 'read')
  OR (p.resource = 'reports'  AND p.action = 'read')
) WHERE r.name = 'sales';

-- yard → inventory rw, purchases rw, reports r
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
     (p.resource = 'inventory' AND p.action IN ('read','write'))
  OR (p.resource = 'purchases' AND p.action IN ('read','write'))
  OR (p.resource = 'reports'   AND p.action = 'read')
) WHERE r.name = 'yard';

-- ─── Migrate existing users into user_roles ───────────────────────────────────
INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'system_migration'
FROM users u
JOIN roles r ON r.name = u.role;
