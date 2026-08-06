// ============ State ============
let socket = null;
let myNickname = '';
let isAdmin = false;
let currentChat = 'public'; // 'public' or private nickname
let privateChats = {};
let uploadedFile = null;
let historyPage = 1;
let historyTotalPages = 1;

// ============ DOM Elements ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const nicknameOverlay = $('#nickname-overlay');
const nicknameInput = $('#nickname-input');
const adminPassword = $('#admin-password');
const nicknameError = $('#nickname-error');
const joinBtn = $('#join-btn');
const app = $('#app');
const messagesContainer = $('#messages-container');
const messagesLoading = $('#messages-loading');
const messageInput = $('#message-input');
const onlineUsersList = $('#online-users-list');
const privateChatsList = $('#private-chats-list');
const onlineCount = $('#online-count');
const chatTitle = $('#chat-title');
const chatSubtitle = $('#chat-subtitle');
const myNicknameEl = $('#my-nickname');
const fileInput = $('#file-input');
const uploadStatus = $('#upload-status');

// ============ Nickname Join ============
nicknameInput.addEventListener('input', () => {
  const val = nicknameInput.value.trim();
  if (val === 'super_user') {
    adminPassword.style.display = 'block';
  } else {
    adminPassword.style.display = 'none';
    adminPassword.value = '';
  }
});

joinBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    nicknameError.textContent = '昵称不能为空';
    return;
  }

  const password = adminPassword.value;
  joinBtn.disabled = true;
  nicknameError.textContent = '';

  connectSocket(nickname, password);
});

nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ============ Socket Connection ============
function connectSocket(nickname, password) {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { nickname, password }, (response) => {
      if (response.error) {
        nicknameError.textContent = response.error;
        joinBtn.disabled = false;
        socket.disconnect();
        return;
      }

      myNickname = nickname;
      isAdmin = response.isAdmin;
      nicknameOverlay.classList.remove('active');
      app.style.display = 'flex';
      myNicknameEl.textContent = isAdmin ? '🔧 管理员模式' : `👤 ${nickname}`;

      if (isAdmin) {
        setupAdminPanel();
      }

      // Load recent history
      loadRecentHistory();
    });
  });

  socket.on('disconnect', () => {
    // Reconnect logic
  });

  socket.on('online_users', (users) => {
    updateOnlineUsers(users);
  });

  socket.on('public_message', (msg) => {
    addMessage(msg, 'other');
  });

  socket.on('private_message', (msg) => {
    const isSelfMsg = msg.from_user === myNickname || (isAdmin && msg.from_user === 'system');
    const other = isSelfMsg ? msg.to_user : msg.from_user;
    openPrivateChat(other);
    addMessage(msg, isSelfMsg ? 'self' : 'other', other);
  });

  socket.on('system_message', (msg) => {
    addSystemMessage(msg);
  });

  socket.on('kicked', (data) => {
    alert(data.reason || '你已被移出聊天室');
    location.reload();
  });

  socket.on('history_cleared', (data) => {
    alert(`已清空 ${data.deleted} 条记录（${data.cutoff} 之前）`);
    $('#clear-status').textContent = `已删除 ${data.deleted} 条记录`;
    if (currentChat === 'public') {
      messagesContainer.innerHTML = '';
      loadRecentHistory();
    }
  });
}

// ============ Message Display ============
function addMessage(msg, side, chatKey) {
  // Filter for current chat
  if (chatKey) {
    if (currentChat !== chatKey) return;
  } else if (msg.type === 'private') {
    return; // Private messages handled separately
  }

  if (currentChat === 'public' && msg.type !== 'public' && msg.message_type) {
    return;
  }

  removeLoading();

  const isSelf = side === 'self' || msg.from_user === myNickname || (isAdmin && msg.from_user === 'system');
  const div = document.createElement('div');
  div.className = `message ${isSelf ? 'self' : 'other'}`;

  let content = '';
  const senderName = msg.from_user === 'system'
    ? '<span class="msg-sender system-sender">[System]</span>'
    : (msg.type === 'public' && !isSelf)
      ? `<span class="msg-sender">${escapeHtml(msg.from_user)}</span>` : '';

  if (msg.message_type === 'text') {
    content = `<div class="msg-bubble">${senderName}${escapeHtml(msg.content)}<div class="msg-time">${formatTime(msg.created_at)}</div></div>`;
  } else if (msg.message_type === 'image') {
    content = `<div class="msg-bubble">${senderName}<img src="${escapeHtml(msg.content)}" class="msg-image" onclick="previewImage('${escapeHtml(msg.content)}')" loading="lazy"><div class="msg-time">${formatTime(msg.created_at)}</div></div>`;
  } else if (msg.message_type === 'video') {
    content = `<div class="msg-bubble">${senderName}<video src="${escapeHtml(msg.content)}" class="msg-video" controls preload="metadata"></video><div class="msg-time">${formatTime(msg.created_at)}</div></div>`;
  } else if (msg.message_type === 'file') {
    content = `<div class="msg-bubble">${senderName}<a href="${escapeHtml(msg.content)}" class="msg-file" target="_blank" download="${escapeHtml(msg.file_name || 'file')}"><span class="msg-file-icon">📄</span><div class="msg-file-info"><div class="msg-file-name">${escapeHtml(msg.file_name || '文件')}</div><div class="msg-file-size">${formatSize(msg.file_size)}</div></div></a><div class="msg-time">${formatTime(msg.created_at)}</div></div>`;
  }

  div.innerHTML = content;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(msg) {
  removeLoading();
  const div = document.createElement('div');
  div.className = 'message system';
  div.innerHTML = `<div class="msg-bubble">${escapeHtml(msg.content)}<div class="msg-time">${formatTime(new Date().toISOString())}</div></div>`;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function removeLoading() {
  if (messagesLoading) messagesLoading.style.display = 'none';
}

function scrollToBottom() {
  setTimeout(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 50);
}

// ============ Send Message ============
function sendMessage() {
  const text = messageInput.value.trim();
  const hasUpload = uploadedFile !== null;

  if (!text && !hasUpload) return;

  if (hasUpload) {
    sendFileMessage(text);
  } else {
    sendTextMessage(text);
  }
}

function sendTextMessage(text) {
  if (currentChat === 'public') {
    socket.emit('public_message', { message_type: 'text', content: text });
  } else {
    socket.emit('private_message', {
      to_user: currentChat,
      message_type: 'text',
      content: text,
    });
  }
  // 消息显示由服务器广播回来时统一处理（避免重复）
  messageInput.value = '';
  messageInput.style.height = 'auto';
}

function sendFileMessage(text) {
  const fileData = uploadedFile;
  if (currentChat === 'public') {
    socket.emit('public_message', {
      message_type: fileData.message_type,
      content: fileData.url,
      file_name: fileData.file_name,
      file_size: fileData.file_size,
      mime_type: fileData.mime_type,
    });
  } else {
    socket.emit('private_message', {
      to_user: currentChat,
      message_type: fileData.message_type,
      content: fileData.url,
      file_name: fileData.file_name,
      file_size: fileData.file_size,
      mime_type: fileData.mime_type,
    });
  }

  // Also send text if any
  if (text) {
    if (currentChat === 'public') {
      socket.emit('public_message', { message_type: 'text', content: text });
    } else {
      socket.emit('private_message', { to_user: currentChat, message_type: 'text', content: text });
    }
  }

  clearUpload();
  messageInput.value = '';
  messageInput.style.height = 'auto';
}

$('#btn-send').addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

// ============ File Upload ============
function triggerFileUpload() {
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  uploadStatus.textContent = `上传中: ${file.name}...`;
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      uploadStatus.textContent = '上传失败: ' + data.error;
      return;
    }
    uploadedFile = data;
    uploadStatus.textContent = `已选择: ${data.file_name} (${formatSize(data.file_size)})`;
  } catch (err) {
    uploadStatus.textContent = '上传失败: ' + err.message;
  }
  fileInput.value = '';
});

function clearUpload() {
  uploadedFile = null;
  uploadStatus.textContent = '';
}

$('#btn-image').addEventListener('click', triggerFileUpload);
$('#btn-video').addEventListener('click', triggerFileUpload);
$('#btn-file').addEventListener('click', triggerFileUpload);

// ============ Online Users ============
function updateOnlineUsers(users) {
  onlineCount.textContent = `在线: ${users.length}`;
  onlineUsersList.innerHTML = users.map(u => `
    <div class="user-item" data-user="${escapeHtml(u)}" onclick="startPrivateChat('${escapeHtml(u)}')">
      <div class="user-avatar">${u[0].toUpperCase()}</div>
      <div class="user-name">${escapeHtml(u)}</div>
      <div class="user-status"></div>
    </div>
  `).join('');

  // Update admin panel user list
  if (isAdmin) {
    updateAdminUserList(users);
  }
}

// ============ Private Chat ============
function startPrivateChat(targetUser) {
  openPrivateChat(targetUser);
  switchChat(targetUser);
}

function openPrivateChat(targetUser) {
  if (privateChats[targetUser]) return;
  privateChats[targetUser] = [];

  const div = document.createElement('div');
  div.className = 'chat-item';
  div.dataset.user = targetUser;
  div.innerHTML = `
    <div class="chat-item-avatar">${targetUser[0].toUpperCase()}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escapeHtml(targetUser)}</div>
      <div class="chat-item-preview">私聊</div>
    </div>
    <span class="chat-item-close" onclick="event.stopPropagation(); closePrivateChat('${escapeHtml(targetUser)}')">&times;</span>
  `;
  div.addEventListener('click', () => switchChat(targetUser));
  privateChatsList.appendChild(div);

  // Load private history
  loadPrivateHistory(targetUser);
}

function switchChat(target) {
  currentChat = target;

  // Update sidebar active
  $$('.chat-item').forEach(el => el.classList.remove('active'));
  const item = target === 'public'
    ? $('.chat-item[data-chat="public"]')
    : $(`.chat-item[data-user="${target}"]`);
  if (item) item.classList.add('active');

  // Update header
  if (target === 'public') {
    chatTitle.textContent = '🌐 公共聊天室';
    chatSubtitle.textContent = '';
  } else {
    chatTitle.textContent = `💬 ${target}`;
    chatSubtitle.textContent = '私聊中...';
  }

  // Clear messages and load
  messagesContainer.innerHTML = '';
  if (target === 'public') {
    loadRecentHistory();
  } else {
    loadPrivateHistory(target);
  }
}

function closePrivateChat(target) {
  if (currentChat === target) {
    switchChat('public');
  }
  delete privateChats[target];
  const item = $(`.chat-item[data-user="${target}"]`);
  if (item) item.remove();
}

// ============ Chat Switcher (Sidebar) ============
$('.chat-item[data-chat="public"]').addEventListener('click', () => switchChat('public'));

// Sidebar Tabs
$$('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.sidebar-panel').forEach(p => p.classList.remove('active'));
    if (tab.dataset.tab === 'chats') {
      $('#chats-panel').classList.add('active');
    } else {
      $('#users-panel').classList.add('active');
    }
  });
});

// ============ History Loading ============
async function loadRecentHistory() {
  try {
    const res = await fetch('/api/history/recent');
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      removeLoading();
      data.messages.forEach(msg => {
        if (msg.type === 'public' && currentChat === 'public') {
          const isSelf = msg.from_user === myNickname || (isAdmin && msg.from_user === 'system');
          addMessage(msg, isSelf ? 'self' : 'other');
        }
      });
    } else {
      removeLoading();
      addSystemMessage({ content: '暂无聊天记录，开始聊天吧！' });
    }
  } catch (err) {
    removeLoading();
    addSystemMessage({ content: '加载历史记录失败' });
  }
}

async function loadPrivateHistory(user) {
  try {
    const res = await fetch('/api/history/all?limit=200');
    const data = await res.json();
    if (data.messages && currentChat === user) {
      messagesContainer.innerHTML = '';
      data.messages.forEach(msg => {
        if (msg.type === 'private' &&
          ((msg.from_user === myNickname && msg.to_user === user) ||
           (msg.from_user === user && msg.to_user === myNickname))) {
          const isSelf = msg.from_user === myNickname || (isAdmin && msg.from_user === 'system');
          addMessage(msg, isSelf ? 'self' : 'other', user);
        }
      });
      if (messagesContainer.children.length === 0) {
        addSystemMessage({ content: `开始和 ${user} 的私聊吧！` });
      }
    }
  } catch (err) {
    // silent
  }
}

// ============ Load All History Modal ============
$('#btn-load-all').addEventListener('click', async () => {
  historyPage = 1;
  $('#history-modal').classList.add('active');
  await loadHistoryPage(1);
});

async function loadHistoryPage(page) {
  historyPage = page;
  $('#history-content').innerHTML = '<div class="loading-indicator"><div class="spinner"></div><span>加载中...</span></div>';
  try {
    const res = await fetch(`/api/history/all?page=${page}&limit=30`);
    const data = await res.json();
    historyTotalPages = data.totalPages;

    let html = `<div style="padding:8px;">共 ${data.total} 条记录 (第 ${data.page}/${data.totalPages} 页)</div>`;
    data.messages.forEach(msg => {
      const typeLabel = msg.type === 'public' ? '公共' : `私聊 (${msg.from_user} → ${msg.to_user})`;
      html += `<div class="history-msg">
        <span class="h-type">[${typeLabel}]</span>
        <span class="h-sender">${escapeHtml(msg.from_user)}:</span>
        ${msg.message_type === 'text' ? escapeHtml(msg.content || '') : `[${msg.message_type}: ${escapeHtml(msg.file_name || '')}]`}
        <span class="h-time">${formatTime(msg.created_at)}</span>
      </div>`;
    });
    $('#history-content').innerHTML = html;

    // Pagination
    let pagHtml = '';
    if (data.totalPages > 1) {
      pagHtml += `<button class="history-page-btn" onclick="loadHistoryPage(1)" ${page===1?'disabled':''}>首页</button>`;
      pagHtml += `<button class="history-page-btn" onclick="loadHistoryPage(${page-1})" ${page<=1?'disabled':''}>上一页</button>`;
      for (let i = Math.max(1, page - 2); i <= Math.min(data.totalPages, page + 2); i++) {
        pagHtml += `<button class="history-page-btn ${i===page?'active':''}" onclick="loadHistoryPage(${i})">${i}</button>`;
      }
      pagHtml += `<button class="history-page-btn" onclick="loadHistoryPage(${page+1})" ${page>=data.totalPages?'disabled':''}>下一页</button>`;
      pagHtml += `<button class="history-page-btn" onclick="loadHistoryPage(${data.totalPages})" ${page===data.totalPages?'disabled':''}>末页</button>`;
    }
    $('#history-pagination').innerHTML = pagHtml;
  } catch (err) {
    $('#history-content').innerHTML = '<div style="color:red;">加载失败</div>';
  }
}

// ============ Export ============
$('#btn-export').addEventListener('click', () => {
  $('#export-modal').classList.add('active');
});

$$('input[name="export-range"]').forEach(radio => {
  radio.addEventListener('change', () => {
    $('#export-date-range').style.display = radio.value === 'range' ? 'block' : 'none';
  });
});

$('#btn-do-export').addEventListener('click', async () => {
  const range = document.querySelector('input[name="export-range"]:checked').value;
  let body = {};
  if (range === 'range') {
    const start = $('#export-start').value;
    const end = $('#export-end').value;
    if (!start || !end) { alert('请选择起止时间'); return; }
    body.start_date = start;
    body.end_date = end;
  }

  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-export.json';
    a.click();
    URL.revokeObjectURL(url);
    $('#export-modal').classList.remove('active');
  } catch (err) {
    alert('导出失败: ' + err.message);
  }
});

// ============ Import ============
$('#btn-import').addEventListener('click', () => {
  $('#import-modal').classList.add('active');
  $('#import-status').textContent = '';
  $('#import-data-file').value = '';
  $('#import-key-file').value = '';
});

$('#btn-do-import').addEventListener('click', async () => {
  const dataFile = $('#import-data-file').files[0];
  if (!dataFile) {
    $('#import-status').textContent = '请选择数据文件';
    return;
  }

  const formData = new FormData();
  formData.append('data_file', dataFile);

  const keyFile = $('#import-key-file').files[0];
  if (keyFile) {
    formData.append('key_file', keyFile);
  }

  $('#import-status').textContent = '导入中...';

  try {
    const res = await fetch('/api/import', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      $('#import-status').textContent = data.error;
    } else {
      $('#import-status').textContent = `导入成功！共 ${data.total} 条，新增 ${data.inserted} 条，跳过 ${data.skipped} 条`;
      // Refresh current view
      if (currentChat === 'public') {
        messagesContainer.innerHTML = '';
        loadRecentHistory();
      }
    }
  } catch (err) {
    $('#import-status').textContent = '导入失败: ' + err.message;
  }
});

// ============ Admin Functions ============
function setupAdminPanel() {
  // Add admin button to header
  const btn = document.createElement('button');
  btn.className = 'btn-sm';
  btn.textContent = '🔧 管理';
  btn.addEventListener('click', () => {
    $('#admin-panel').classList.add('active');
    updateAdminUserList([]);
  });
  $('.header-right').insertBefore(btn, $('.header-right').firstChild);

  // Clear history buttons
  $$('#admin-panel .btn-danger').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.clear;
      if (confirm(`确认清空 ${period === '1y' ? '一年' : period === '1m' ? '一个月' : '一周'} 以前的记录？此操作不可撤销！`)) {
        socket.emit('clear_history', { period });
      }
    });
  });
}

function updateAdminUserList(users) {
  if (!isAdmin) return;
  $('#admin-user-list').innerHTML = users.length === 0
    ? '<div style="color:#999;">暂无在线用户</div>'
    : users.map(u => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;">
        <span>${escapeHtml(u)}</span>
        <button class="btn-danger" style="padding:4px 10px;font-size:12px;" onclick="kickUser('${escapeHtml(u)}')">移除</button>
      </div>
    `).join('');
}

function kickUser(nickname) {
  if (confirm(`确认移除用户 "${nickname}"？`)) {
    socket.emit('kick_user', { nickname });
    addSystemMessage({ content: `管理员移除了用户 ${nickname}` });
  }
}

// ============ Image Preview ============
function previewImage(url) {
  $('#image-preview-img').src = url;
  $('#image-preview-modal').classList.add('active');
}
$('#image-preview-modal').addEventListener('click', function(e) {
  if (e.target === this || e.target.classList.contains('image-preview-close')) {
    this.classList.remove('active');
  }
});

// ============ Modal Close ============
$$('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const modalId = btn.dataset.modal;
    if (modalId) $(`#${modalId}`).classList.remove('active');
  });
});

// Close modals on outside click
$$('.modal').forEach(modal => {
  modal.addEventListener('click', function(e) {
    if (e.target === this && !this.classList.contains('image-preview-modal')) {
      this.classList.remove('active');
    }
  });
});

// ============ Utility Functions ============
function escapeHtml(str) {
  if (!str) return '';
  str = String(str);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (isToday) return `${hh}:${mm}`;
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${MM}-${DD} ${hh}:${mm}`;
  } catch {
    return dateStr;
  }
}

function formatSize(bytes) {
  if (!bytes) return '未知';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Expose functions to global scope for onclick handlers
window.previewImage = previewImage;
window.startPrivateChat = startPrivateChat;
window.closePrivateChat = closePrivateChat;
window.kickUser = kickUser;
window.loadHistoryPage = loadHistoryPage;
