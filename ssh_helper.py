import pty, os, subprocess, sys

host = "122.9.11.145"
user = "root"
password = "zzm@20090819"
cmd = sys.argv[1] if len(sys.argv) > 1 else "echo OK && node -v 2>&1 && npm -v 2>&1"

def ssh_with_password(cmd):
    """Run SSH command using pseudo-terminal for password entry."""
    pid, fd = pty.fork()
    if pid == 0:
        # Child: run ssh
        os.execvp("ssh", ["ssh", "-o", "StrictHostKeyChecking=no",
                          f"{user}@{host}", cmd])
    else:
        # Parent: wait for password prompt and send it
        output = b""
        while True:
            try:
                data = os.read(fd, 4096)
                output += data
                decoded = output.decode(errors="replace")
                if "password:" in decoded.lower() or "Password:" in decoded:
                    os.write(fd, (password + "\n").encode())
                # Wait for command completion
                if len(output) > 500:
                    # Give time for command to finish
                    pass
            except OSError:
                break
        # Wait for child
        os.waitpid(pid, 0)
        return output.decode(errors="replace")

result = ssh_with_password(cmd)
# Remove password prompt lines
lines = result.split("\n")
clean = []
for line in lines:
    if "password" not in line.lower() and "password:" not in line.lower():
        clean.append(line)
print("\n".join(clean))
