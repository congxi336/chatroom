"""Remote fix script - run on server to apply Chinese filename fix."""
import os

targets = ['/root/chat', '/root/chat2']

# 1. Fix server.js - add download endpoint
download_endpoint = """
// Download endpoint with proper Content-Disposition for Chinese filenames
app.get('/api/download', (req, res) => {
  const filePath = req.query.path;
  const fileName = req.query.name || 'file';
  if (!filePath) return res.status(400).json({ error: 'Missing path' });
  const fullPath = require('path').join(__dirname, filePath);
  if (!require('fs').existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
  const encodedName = encodeURIComponent(fileName).replace(/['()]/g, function(c) { return '%' + c.charCodeAt(0).toString(16); });
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"; filename*=UTF-8\\'\\'' + encodedName);
  res.sendFile(fullPath);
});
"""

for tgt in targets:
    # Fix server.js
    sp = os.path.join(tgt, 'server.js')
    with open(sp, 'r') as f:
        content = f.read()
    
    if '/api/download' not in content:
        # Insert after the upload endpoint closing
        marker = "    mime_type: req.file.mimetype,\n  });\n});"
        insert_point = content.index(marker) + len(marker)
        content = content[:insert_point] + "\n" + download_endpoint + content[insert_point:]
        with open(sp, 'w') as f:
            f.write(content)
        print(f'{sp}: added download endpoint')
    else:
        print(f'{sp}: download endpoint already exists')

    # Fix app.js
    ap = os.path.join(tgt, 'public', 'app.js')
    with open(ap, 'r') as f:
        content = f.read()
    
    old = '} else if (msg.message_type === \'file\') {\n    content = `<div class="msg-bubble">${senderName}<a href="${escapeHtml(msg.content)}" class="msg-file" target="_blank" download="${escapeHtml(msg.file_name || \'file\')}"'
    
    new = '''} else if (msg.message_type === 'file') {
    const dlName = (msg.file_name || 'file').replace(/"/g, '');
    const dlUrl = `/api/download?path=${encodeURIComponent(msg.content)}&name=${encodeURIComponent(dlName)}`;
    content = `<div class="msg-bubble">${senderName}<a href="${dlUrl}" class="msg-file"'''
    
    if old in content:
        content = content.replace(old, new)
        with open(ap, 'w') as f:
            f.write(content)
        print(f'{ap}: fixed download link')
    elif '/api/download' in content:
        print(f'{ap}: already fixed')
    else:
        print(f'{ap}: WARNING - pattern not found!')

print('All done')
