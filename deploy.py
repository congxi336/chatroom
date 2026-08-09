"""Deploy chat app to remote server - uses SSH_ASKPASS for password auth."""
import subprocess, sys, os, tempfile

HOST = "122.9.11.145"
USER = "root"
PASS = "zzm@20090819"

def make_askpass():
    """Create a temporary SSH_ASKPASS script that outputs the password."""
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False, prefix="askpass_")
    f.write("#!/bin/bash\necho '" + PASS + "'\n")
    f.close()
    os.chmod(f.name, 0o700)
    return f.name

def ssh_run(cmd, timeout=60):
    askpass = make_askpass()
    env = os.environ.copy()
    env["SSH_ASKPASS"] = askpass
    env["DISPLAY"] = "dummy:0"
    env.pop("SSH_ASKPASS_REQUIRE", None)
    
    proc = subprocess.Popen(
        ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "PubkeyAuthentication=no",
         "-o", "PreferredAuthentications=password",
         f"{USER}@{HOST}", cmd],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
    os.unlink(askpass)
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")

def scp_put(local, remote, timeout=60):
    askpass = make_askpass()
    env = os.environ.copy()
    env["SSH_ASKPASS"] = askpass
    env["DISPLAY"] = "dummy:0"
    
    proc = subprocess.Popen(
        ["scp", "-o", "StrictHostKeyChecking=no", "-o", "PubkeyAuthentication=no",
         "-o", "PreferredAuthentications=password", "-r",
         local, f"{USER}@{HOST}:{remote}"],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
    os.unlink(askpass)
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")

def clean(text):
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if line and "assword" not in line.lower() and "Permission denied" not in line:
            lines.append(line)
    return "\n".join(lines)

action = sys.argv[1] if len(sys.argv) > 1 else "check"

if action == "check":
    code, out, err = ssh_run("echo OK && uname -a && node -v 2>&1 && npm -v 2>&1 && pm2 -v 2>&1")
    print(f"EXIT={code}")
    print(clean(out + "\n" + err))

elif action == "deploy":
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)))
    
    print("=== 1. Check server ===")
    code, out, err = ssh_run("echo OK && node -v 2>&1")
    print(clean(out))
    if "command not found" in (out + err).lower() or code != 0:
        print("ERROR: Node.js not installed! Install first:")
        print("  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -")
        print("  apt install -y nodejs")
        sys.exit(1)
    
    print("\n=== 2. Create directories ===")
    ssh_run("mkdir -p /root/chat/public /root/chat/uploads/images /root/chat/uploads/videos /root/chat/uploads/files /root/chat/keys")
    
    print("=== 3. Upload files ===")
    files = [
        (f"{base}/server.js", "/root/chat/server.js"),
        (f"{base}/package.json", "/root/chat/package.json"),
        (f"{base}/package-lock.json", "/root/chat/package-lock.json"),
        (f"{base}/public/index.html", "/root/chat/public/index.html"),
        (f"{base}/public/style.css", "/root/chat/public/style.css"),
        (f"{base}/public/app.js", "/root/chat/public/app.js"),
    ]
    for local, remote in files:
        name = local.split("\\")[-1]
        print(f"  {name:20s} ... ", end="", flush=True)
        code, _, err = scp_put(local, remote)
        print("OK" if code == 0 else f"FAIL")
        if code != 0:
            print(f"    {err[:100]}")
    
    print("\n=== 4. npm install ===")
    code, out, err = ssh_run("cd /root/chat && npm install 2>&1", timeout=300)
    print(clean(out + "\n" + err))
    
    print("\n=== 5. Start server ===")
    code, out, err = ssh_run(
        'cd /root/chat && '
        '(which pm2 2>/dev/null && '
        ' (pm2 delete chatroom 2>/dev/null; pm2 start server.js --name chatroom; pm2 save) '
        '|| (pkill -f "node server" 2>/dev/null; '
        ' nohup node server.js > /tmp/chat.log 2>&1 & '
        ' sleep 2; echo "PID:"; ps aux | grep "node server" | grep -v grep)) 2>&1'
    )
    print(clean(out + "\n" + err))
    
    print("\n================================")
    print("  Deploy complete!")
    print("  http://122.9.11.145:3000")
    print("================================")

else:
    print("Usage: python deploy.py check | deploy")
