require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT) || 3306,
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

const pool = mysql.createPool(dbConfig);

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function fnv1aHex(str) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

async function initDatabaseSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('Schema MySQL verificado/inicializado com sucesso.');
    }
  } catch (err) {
    console.warn('Aviso ao inicializar schema automaticamente:', err.message);
  }
}

function mapItemRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity) || 0,
    minStock: Number(row.min_stock) || 0,
    unitCost: Number(row.unit_cost) || 0
  };
}

function mapUniformRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    size: row.size,
    quantity: Number(row.quantity) || 0,
    minStock: Number(row.min_stock) || 0,
    unitCost: Number(row.unit_cost) || 0
  };
}

function mapMovementRow(row) {
  return {
    id: row.id,
    kind: row.stock_kind,
    type: row.movement_type,
    productId: row.stock_kind === 'uniform' ? row.uniform_id : row.item_id,
    productName: row.product_name,
    quantity: Number(row.quantity) || 0,
    previousQuantity: row.previous_quantity !== null ? Number(row.previous_quantity) : null,
    newQuantity: row.new_quantity !== null ? Number(row.new_quantity) : null,
    note: row.note || '',
    responsible: row.responsible || 'Vinícius (Operador)',
    timestamp: new Date(row.created_at).getTime()
  };
}

app.get('/', (_req, res) => {
  res.json({
    service: 'Estoque Fácil — Operador Vinícius (v8)',
    platform: 'Railway MySQL API',
    status: 'online'
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset / Seed demo
app.post('/api/seed', async (_req, res) => {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    res.json({ ok: true, seeded: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// AUTH: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (!rows.length) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    const user = rows[0];
    if (!user.active) {
      return res.status(403).json({ error: 'Conta desativada. Procure o Administrador.' });
    }
    const inputSha = sha256(password);
    const inputFnv = fnv1aHex(password);
    const valid =
      (user.password_hash && user.password_hash === inputSha) ||
      (user.pass_code && user.pass_code === inputFnv);
    if (!valid) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUTH: Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || password.length < 4) {
      return res.status(400).json({ error: 'Preencha nome, e-mail e senha (mín. 4 caracteres).' });
    }
    const [existing] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    const id = 'usr-' + Date.now();
    await pool.query(
      'INSERT INTO users (id, name, email, role, active, password_hash, pass_code) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [id, name, email, 'Operador', sha256(password), fnv1aHex(password)]
    );
    res.status(201).json({
      user: { id, name, email, role: 'Operador' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ITENS CRUD
app.get('/api/items', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM items ORDER BY sku ASC, name ASC');
    res.json(rows.map(mapItemRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const id = req.body.id || ('itm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5));
    const sku = String(req.body.sku || '').trim();
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || 'Geral').trim();
    const quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    const minStock = Math.max(0, parseInt(req.body.minStock, 10) || 0);
    const unitCost = Math.max(0, parseFloat(req.body.unitCost) || 0);

    if (!sku || !name) {
      return res.status(400).json({ error: 'Código e nome do item são obrigatórios.' });
    }

    await pool.query(
      'INSERT INTO items (id, sku, name, category, quantity, min_stock, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, category, quantity, minStock, unitCost]
    );
    res.status(201).json({ id, sku, name, category, quantity, minStock, unitCost });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Já existe um item com este código SKU.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sku = String(req.body.sku || '').trim();
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || 'Geral').trim();
    const quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    const minStock = Math.max(0, parseInt(req.body.minStock, 10) || 0);
    const unitCost = Math.max(0, parseFloat(req.body.unitCost) || 0);

    const [result] = await pool.query(
      'UPDATE items SET sku = ?, name = ?, category = ?, quantity = ?, min_stock = ?, unit_cost = ? WHERE id = ?',
      [sku, name, category, quantity, minStock, unitCost, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Item não encontrado.' });
    res.json({ id, sku, name, category, quantity, minStock, unitCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM items WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Item não encontrado.' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FARDAMENTOS CRUD
app.get('/api/uniforms', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM uniforms ORDER BY sku ASC, name ASC');
    res.json(rows.map(mapUniformRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/uniforms', async (req, res) => {
  try {
    const id = req.body.id || ('far-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5));
    const sku = String(req.body.sku || '').trim();
    const name = String(req.body.name || '').trim();
    const size = String(req.body.size || 'Único').trim();
    const quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    const minStock = Math.max(0, parseInt(req.body.minStock, 10) || 0);
    const unitCost = Math.max(0, parseFloat(req.body.unitCost) || 0);

    if (!sku || !name) {
      return res.status(400).json({ error: 'Código e nome do fardamento são obrigatórios.' });
    }

    await pool.query(
      'INSERT INTO uniforms (id, sku, name, size, quantity, min_stock, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, sku, name, size, quantity, minStock, unitCost]
    );
    res.status(201).json({ id, sku, name, size, quantity, minStock, unitCost });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Já existe um fardamento com este código SKU.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/uniforms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sku = String(req.body.sku || '').trim();
    const name = String(req.body.name || '').trim();
    const size = String(req.body.size || 'Único').trim();
    const quantity = Math.max(0, parseInt(req.body.quantity, 10) || 0);
    const minStock = Math.max(0, parseInt(req.body.minStock, 10) || 0);
    const unitCost = Math.max(0, parseFloat(req.body.unitCost) || 0);

    const [result] = await pool.query(
      'UPDATE uniforms SET sku = ?, name = ?, size = ?, quantity = ?, min_stock = ?, unit_cost = ? WHERE id = ?',
      [sku, name, size, quantity, minStock, unitCost, id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Fardamento não encontrado.' });
    res.json({ id, sku, name, size, quantity, minStock, unitCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/uniforms/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM uniforms WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Fardamento não encontrado.' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MOVIMENTAÇÕES
app.get('/api/movements', async (req, res) => {
  try {
    const kind = req.query.kind;
    const type = req.query.type;
    const conditions = [];
    const params = [];

    if (kind === 'item' || kind === 'uniform') {
      conditions.push('stock_kind = ?');
      params.push(kind);
    }
    if (type === 'ENTRADA' || type === 'SAÍDA' || type === 'AJUSTE') {
      conditions.push('movement_type = ?');
      params.push(type);
    }

    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT * FROM movements ${whereSql} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json(rows.map(mapMovementRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/movements', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const kind = req.body.kind === 'uniform' ? 'uniform' : 'item';
    const type = req.body.type;
    const productId = String(req.body.productId || '').trim();
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 0);
    const note = String(req.body.note || '').trim();
    const responsible = String(req.body.responsible || 'Vinícius (Operador)').trim();
    const userId = req.body.userId || null;

    if (!['ENTRADA', 'SAÍDA', 'AJUSTE'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de movimentação inválido.' });
    }
    if (!productId) {
      return res.status(400).json({ error: 'Selecione um item ou fardamento.' });
    }

    await conn.beginTransaction();

    const table = kind === 'uniform' ? 'uniforms' : 'items';
    const [rows] = await conn.query(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [productId]);
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Cadastro não encontrado no estoque.' });
    }

    const entry = rows[0];
    const currentQty = Number(entry.quantity) || 0;
    let nextQty = currentQty;

    if (type === 'ENTRADA') {
      nextQty = currentQty + qty;
    } else if (type === 'SAÍDA') {
      if (qty > currentQty) {
        await conn.rollback();
        return res.status(400).json({ error: `Saldo insuficiente (${currentQty} un. disponíveis).` });
      }
      nextQty = currentQty - qty;
    } else if (type === 'AJUSTE') {
      nextQty = qty;
    }

    await conn.query(`UPDATE ${table} SET quantity = ? WHERE id = ?`, [nextQty, productId]);

    const movId = 'mov-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const productName = kind === 'uniform' && entry.size ? `${entry.name} (${entry.size})` : entry.name;
    const itemId = kind === 'item' ? productId : null;
    const uniformId = kind === 'uniform' ? productId : null;

    await conn.query(
      `INSERT INTO movements (
        id, stock_kind, movement_type, item_id, uniform_id, product_name,
        quantity, previous_quantity, new_quantity, note, responsible, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [movId, kind, type, itemId, uniformId, productName, qty, currentQty, nextQty, note, responsible, userId]
    );

    await conn.commit();

    res.status(201).json({
      id: movId,
      kind,
      type,
      productId,
      productName,
      quantity: qty,
      previousQuantity: currentQty,
      newQuantity: nextQty,
      note,
      responsible,
      timestamp: Date.now()
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

app.listen(PORT, async () => {
  await initDatabaseSchema();
  console.log(`Estoque Fácil Railway MySQL API rodando na porta ${PORT}`);
});
