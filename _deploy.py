import base64, os

# Files to deploy
targets = ['/root/chat', '/root/chat2']
files = {
    'server.js': open('/tmp/server_b64.txt').read(),
    'app.js': open('/tmp/app_b64.txt').read(),
}

for tgt in targets:
    os.system(f'mkdir -p {tgt}/public')
    for fname, b64 in files.items():
        path = f'{tgt}/{fname}' if fname == 'server.js' else f'{tgt}/public/{fname}'
        with open(path, 'wb') as f:
            f.write(base64.b64decode(b64))
        print(f'{path} written')
