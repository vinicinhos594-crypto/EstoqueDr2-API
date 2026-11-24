-- ============================================================================
-- ESTOQUE FÁCIL — OPERADOR VINÍCIUS (v8)
-- Schema MySQL 8.0+ para Railway / Produção
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  role VARCHAR(40) NOT NULL DEFAULT 'Operador',
  active TINYINT(1) NOT NULL DEFAULT 1,
  password_hash VARCHAR(255) NOT NULL,
  pass_code VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  sku VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Geral',
  quantity INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 5,
  unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_items_qty_nonneg CHECK (quantity >= 0),
  CONSTRAINT chk_items_min_nonneg CHECK (min_stock >= 0),
  CONSTRAINT chk_items_cost_nonneg CHECK (unit_cost >= 0.00),
  INDEX idx_items_category (category),
  INDEX idx_items_name (name),
  INDEX idx_items_low_stock (quantity, min_stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uniforms (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  sku VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  size VARCHAR(20) NOT NULL DEFAULT 'Único',
  quantity INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 5,
  unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_uniforms_qty_nonneg CHECK (quantity >= 0),
  CONSTRAINT chk_uniforms_min_nonneg CHECK (min_stock >= 0),
  CONSTRAINT chk_uniforms_cost_nonneg CHECK (unit_cost >= 0.00),
  INDEX idx_uniforms_size (size),
  INDEX idx_uniforms_name (name),
  INDEX idx_uniforms_low_stock (quantity, min_stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS movements (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  stock_kind ENUM('item', 'uniform') NOT NULL DEFAULT 'item',
  movement_type ENUM('ENTRADA', 'SAÍDA', 'AJUSTE') NOT NULL,
  item_id VARCHAR(64) NULL,
  uniform_id VARCHAR(64) NULL,
  product_name VARCHAR(200) NOT NULL,
  quantity INT NOT NULL,
  previous_quantity INT NULL,
  new_quantity INT NULL,
  note VARCHAR(255) NULL,
  responsible VARCHAR(120) NOT NULL DEFAULT 'Vinícius (Operador)',
  user_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_movements_qty_pos CHECK (quantity > 0),
  CONSTRAINT fk_mov_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_mov_uniform FOREIGN KEY (uniform_id) REFERENCES uniforms(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_mov_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_mov_kind (stock_kind),
  INDEX idx_mov_type (movement_type),
  INDEX idx_mov_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO users (id, name, email, role, active, password_hash, pass_code)
VALUES (
  'usr-vinicius',
  'Vinícius (Operador)',
  'vinicius@estoquefacil.local',
  'Operador',
  1,
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  '050c5d7e'
);

INSERT IGNORE INTO items (id, sku, name, category, quantity, min_stock, unit_cost) VALUES
  ('itm-1', 'ITM-001', 'Caixa Papelão 30x20x15', 'Embalagens', 42, 15, 3.40),
  ('itm-2', 'ITM-002', 'Fita Adesiva Transparente 48mm', 'Embalagens', 6, 10, 5.90),
  ('itm-3', 'ITM-003', 'Etiqueta Térmica 100x150mm', 'Insumos', 0, 8, 24.50),
  ('itm-4', 'ITM-004', 'Estilete Largo Profissional 18mm', 'Ferramentas', 14, 5, 12.00);

INSERT IGNORE INTO uniforms (id, sku, name, size, quantity, min_stock, unit_cost) VALUES
  ('far-1', 'FAR-001', 'Camisa Operacional Manga Curta', 'M', 22, 8, 42.00),
  ('far-2', 'FAR-002', 'Camisa Operacional Manga Curta', 'G', 5, 8, 42.00),
  ('far-3', 'FAR-003', 'Calça Brim Profissional', 'GG', 0, 6, 68.50),
  ('far-4', 'FAR-004', 'Jaleco / Avental Técnico', 'P', 11, 5, 54.00);

INSERT IGNORE INTO movements (
  id, stock_kind, movement_type, item_id, uniform_id, product_name,
  quantity, previous_quantity, new_quantity, note, responsible, user_id, created_at
) VALUES
  ('mov-1', 'item', 'ENTRADA', 'itm-1', NULL, 'Caixa Papelão 30x20x15', 25, 17, 42, 'Compra NF #842', 'Vinícius (Operador)', 'usr-vinicius', DATE_SUB(NOW(3), INTERVAL 2 HOUR)),
  ('mov-2', 'uniform', 'SAÍDA', NULL, 'far-2', 'Camisa Operacional Manga Curta (G)', 3, 8, 5, 'Entrega fardamento equipe', 'Vinícius (Operador)', 'usr-vinicius', DATE_SUB(NOW(3), INTERVAL 5 HOUR)),
  ('mov-3', 'item', 'SAÍDA', 'itm-3', NULL, 'Etiqueta Térmica 100x150mm', 8, 8, 0, 'Último rolo utilizado', 'Vinícius (Operador)', 'usr-vinicius', DATE_SUB(NOW(3), INTERVAL 24 HOUR));
