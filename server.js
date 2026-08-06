const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// ============ Configuration ============
const PORT = process.env.PORT || 3000;
const ADMIN_NICK = 'super_user';
const ADMIN_PASS = 'son_moon_21';
const KEY_FILE = path.join(__dirname, 'keys', 'import-key.json');
const DB_FILE = path.join(__dirname, 'database.sqlite');

// ============ Express & HTTP Setup ============
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 500 * 1024 * 1024, // 500MB for large files
});

app.use(express.json({ limit: '500mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure required directories exist
['uploads/images', 'uploads/videos', 'uploads/files'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ============ Database Setup ============
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('public','private')),
    from_user TEXT NOT NULL,
    to_user TEXT,
    message_type TEXT NOT NULL CHECK(message_type IN ('text','image','video','file')),
    content TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
  CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user);
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user);
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

// ============ Import Key Management ============
function getOrCreateImportKey() {
  // Ensure keys directory exists
  const keyDir = path.dirname(KEY_FILE);
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }

  if (fs.existsSync(KEY_FILE)) {
    return JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
  }
  const key = {
    secret: crypto.randomBytes(32).toString('hex'),
    created_at: new Date().toISOString(),
    description: 'Import verification key - keep this file safe. Required for importing chat records.',
  };
  fs.writeFileSync(KEY_FILE, JSON.stringify(key, null, 2));
  return key;
}

const importKey = getOrCreateImportKey();

function signData(data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHmac('sha256', importKey.secret).update(content).digest('hex');
}

function verifySignature(data, signature) {
  const expected = signData(data);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ============ File Upload Config ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = 'files';
    if (file.mimetype.startsWith('image/')) dir = 'images';
    else if (file.mimetype.startsWith('video/')) dir = 'videos';
    cb(null, path.join(__dirname, 'uploads', dir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// ============ File Upload Endpoint ============
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileType = req.file.mimetype.startsWith('image/') ? 'image'
    : req.file.mimetype.startsWith('video/') ? 'video' : 'file';
  const url = `/uploads/${fileType}s/${req.file.filename}`;
  res.json({
    url,
    message_type: fileType,
    file_name: req.file.originalname,
    file_size: req.file.size,
    mime_type: req.file.mimetype,
  });
});

// ============ Chat History API ============
// Get last week's messages
app.get('/api/history/recent', (req, res) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').substring(0, 19);
  const msgs = db.prepare(`
    SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at ASC
  `).all(oneWeekAgo);
  res.json({ messages: msgs });
});

// Get all messages with pagination
app.get('/api/history/all', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const msgs = db.prepare(`
    SELECT * FROM messages ORDER BY created_at ASC LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({
    messages: msgs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// Export chat history
app.post('/api/export', (req, res) => {
  const { start_date, end_date } = req.body;
  let msgs;
  if (start_date && end_date) {
    msgs = db.prepare(`
      SELECT * FROM messages WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC
    `).all(start_date, end_date);
  } else {
    msgs = db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all();
  }

  const exportData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    message_count: msgs.length,
    messages: msgs,
  };

  const signature = signData(exportData);
  exportData.signature = signature;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=chat-export.json');
  res.json(exportData);
});

// Import chat history
app.post('/api/import', upload.fields([
  { name: 'data_file', maxCount: 1 },
  { name: 'key_file', maxCount: 1 },
]), (req, res) => {
  try {
    const dataFile = req.files['data_file']?.[0];
    const keyFile = req.files['key_file']?.[0];

    if (!dataFile) {
      return res.status(400).json({ error: '缺少导入数据文件' });
    }

    // Read and parse data
    const dataContent = fs.readFileSync(dataFile.path, 'utf-8');
    let importData;
    try {
      importData = JSON.parse(dataContent);
    } catch {
      return res.status(400).json({ error: '数据文件格式无效，需要JSON格式' });
    }

    if (!importData.messages || !Array.isArray(importData.messages)) {
      return res.status(400).json({ error: '数据文件缺少 messages 字段' });
    }

    // Verify signature if key file is provided
    if (keyFile) {
      const keyContent = fs.readFileSync(keyFile.path, 'utf-8');
      let keyData;
      try {
        keyData = JSON.parse(keyContent);
      } catch {
        return res.status(400).json({ error: '密钥文件格式无效' });
      }

      if (!keyData.secret) {
        return res.status(400).json({ error: '密钥文件缺少 secret 字段' });
      }

      if (keyData.secret !== importKey.secret) {
        return res.status(403).json({ error: '密钥验证失败：密钥文件不匹配' });
      }
    } else {
      // No key file provided — require signature verification
      if (!importData.signature) {
        return res.status(403).json({
          error: '导入需要密钥验证。请上传密钥文件(key-file)或提供带有有效签名的导出文件',
        });
      }
      const signature = importData.signature;
      delete importData.signature;
      const dataToVerify = { ...importData };
      if (!verifySignature(dataToVerify, signature)) {
        return res.status(403).json({ error: '签名验证失败：文件可能被篡改或不完整' });
      }
    }

    // Merge messages
    const insert = db.prepare(`
      INSERT OR IGNORE INTO messages (message_id, type, from_user, to_user, message_type, content, file_name, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const mergeMany = db.transaction((msgs) => {
      let inserted = 0;
      for (const msg of msgs) {
        const result = insert.run(
          msg.message_id || uuidv4(),
          msg.type || 'public',
          msg.from_user || 'unknown',
          msg.to_user || null,
          msg.message_type || 'text',
          msg.content || '',
          msg.file_name || null,
          msg.file_size || null,
          msg.mime_type || null,
          msg.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19)
        );
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const inserted = mergeMany(importData.messages);

    // Clean up temp files
    try { fs.unlinkSync(dataFile.path); } catch {}
    if (keyFile) try { fs.unlinkSync(keyFile.path); } catch {}

    res.json({
      success: true,
      total: importData.messages.length,
      inserted,
      skipped: importData.messages.length - inserted,
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: '导入失败：' + err.message });
  }
});

// ============ Online Users Tracking ============
const onlineUsers = new Map(); // socketId -> { nickname, isAdmin }

// ============ Socket.io ============
io.on('connection', (socket) => {
  console.log(`[连接] 新连接: ${socket.id}`);

  // ===== Join =====
  socket.on('join', (data, callback) => {
    const nickname = (data.nickname || '').trim();
    if (!nickname) {
      return callback({ error: '昵称不能为空' });
    }

    // Check admin
    let isAdmin = false;
    if (nickname === ADMIN_NICK) {
      if (data.password === ADMIN_PASS) {
        isAdmin = true;
      } else {
        return callback({ error: '管理员密码错误' });
      }
    }

    // Check duplicate nickname (except admin)
    if (!isAdmin) {
      for (const [sid, user] of onlineUsers) {
        if (user.nickname === nickname && !user.isAdmin) {
          return callback({ error: '该昵称已被使用，请更换' });
        }
      }
    }

    socket.data.nickname = nickname;
    socket.data.isAdmin = isAdmin;
    onlineUsers.set(socket.id, { nickname, isAdmin });

    callback({ success: true, isAdmin });

    // Get user list (exclude admin)
    const userList = getUserList();
    io.emit('online_users', userList);

    if (!isAdmin) {
      socket.broadcast.emit('system_message', {
        content: `${nickname} 加入了聊天室`,
        type: 'join',
      });
    }

    console.log(`[加入] ${nickname}${isAdmin ? ' [管理员]' : ''} (${socket.id})`);
  });

  // ===== Public Message =====
  socket.on('public_message', (data) => {
    const nickname = socket.data.nickname;
    if (!nickname) return;

    const msgId = uuidv4();
    const displayName = socket.data.isAdmin ? 'system' : nickname;

    const msg = {
      message_id: msgId,
      type: 'public',
      from_user: displayName,
      to_user: null,
      message_type: data.message_type || 'text',
      content: data.content || '',
      file_name: data.file_name || null,
      file_size: data.file_size || null,
      mime_type: data.mime_type || null,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    // Save to DB
    db.prepare(`
      INSERT INTO messages (message_id, type, from_user, to_user, message_type, content, file_name, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(msg.message_id, msg.type, msg.from_user, msg.to_user,
      msg.message_type, msg.content, msg.file_name, msg.file_size, msg.mime_type, msg.created_at);

    // For admin messages visible to all
    io.emit('public_message', msg);
  });

  // ===== Private Message =====
  socket.on('private_message', (data) => {
    const fromUser = socket.data.nickname;
    if (!fromUser) return;

    const msgId = uuidv4();
    const displayFrom = socket.data.isAdmin ? 'system' : fromUser;

    const msg = {
      message_id: msgId,
      type: 'private',
      from_user: displayFrom,
      to_user: data.to_user,
      message_type: data.message_type || 'text',
      content: data.content || '',
      file_name: data.file_name || null,
      file_size: data.file_size || null,
      mime_type: data.mime_type || null,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    // Save to DB
    db.prepare(`
      INSERT INTO messages (message_id, type, from_user, to_user, message_type, content, file_name, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(msg.message_id, msg.type, msg.from_user, msg.to_user,
      msg.message_type, msg.content, msg.file_name, msg.file_size, msg.mime_type, msg.created_at);

    // Send to target
    for (const [sid, user] of onlineUsers) {
      if (user.nickname === data.to_user) {
        io.to(sid).emit('private_message', msg);
        break;
      }
    }
    // Send back to sender
    socket.emit('private_message', msg);
  });

  // ===== Admin: Kick User =====
  socket.on('kick_user', (data) => {
    if (!socket.data.isAdmin) return;

    const targetNick = data.nickname;
    for (const [sid, user] of onlineUsers) {
      if (user.nickname === targetNick && !user.isAdmin) {
        io.to(sid).emit('kicked', { reason: '你已被管理员移出聊天室' });
        setTimeout(() => {
          const s = io.sockets.sockets.get(sid);
          if (s) s.disconnect(true);
        }, 500);
        break;
      }
    }
  });

  // ===== Admin: Clear Old History =====
  socket.on('clear_history', (data) => {
    if (!socket.data.isAdmin) return;

    const { period } = data; // '1y', '1m', '1w'
    let cutoff;
    const now = new Date();
    switch (period) {
      case '1y':
        cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '1m':
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '1w':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        return;
    }

    const cutoffStr = cutoff.toISOString().replace('T', ' ').substring(0, 19);
    const result = db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoffStr);

    socket.emit('history_cleared', {
      period,
      deleted: result.changes,
      cutoff: cutoffStr,
    });
    io.emit('system_message', {
      content: `管理员清空了${period === '1y' ? '一年' : period === '1m' ? '一个月' : '一周'}以前的聊天记录`,
      type: 'system',
    });
  });

  // ===== Disconnect =====
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user && !user.isAdmin) {
      io.emit('system_message', {
        content: `${user.nickname} 离开了聊天室`,
        type: 'leave',
      });
    }
    onlineUsers.delete(socket.id);
    io.emit('online_users', getUserList());
    console.log(`[断开] ${user?.nickname || '未知'} (${socket.id})`);
  });
});

function getUserList() {
  const list = [];
  for (const [, user] of onlineUsers) {
    if (!user.isAdmin) {
      list.push(user.nickname);
    }
  }
  return list;
}

// ============ Start Server ============
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  匿名聊天室已启动`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  导入密钥文件: ${KEY_FILE}`);
  console.log(`========================================\n`);
});
