#!/usr/bin/env python3
"""Deploy server/ to VPS via Paramiko (password or key from .env)."""
from __future__ import annotations

import os
import posixpath
import sys
import tarfile
import tempfile
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("Install: pip install paramiko")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
ENV_PATH = ROOT / ".env"
REMOTE_PATH = os.environ.get("DEPLOY_PATH", "/opt/pvz")


def load_deploy_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_PATH.exists():
        return values
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key.startswith("DEPLOY_"):
            values[key] = value
    return values


def collect_files(base: Path) -> list[tuple[Path, str]]:
    files: list[tuple[Path, str]] = []
    for path in base.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(base).as_posix()
        if rel.startswith("node_modules/") or rel == ".env":
            continue
        files.append((path, posixpath.join(REMOTE_PATH, rel)))
    return files


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts: list[str] = []
    for part in remote_dir.strip("/").split("/"):
        parts.append(part)
        current = "/" + "/".join(parts)
        try:
            sftp.stat(current)
        except OSError:
            sftp.mkdir(current)


def run_remote(ssh: paramiko.SSHClient, command: str) -> int:
    print(f"$ {command}")
    _, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out:
        sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
        if not out.endswith("\n"):
            sys.stdout.buffer.write(b"\n")
    if err:
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
        if not err.endswith("\n"):
            sys.stderr.buffer.write(b"\n")
    return stdout.channel.recv_exit_status()


def main() -> int:
    env = load_deploy_env()
    host = env.get("DEPLOY_SSH_HOST", "79.137.192.194")
    user = env.get("DEPLOY_SSH_USER", "root")
    password = env.get("DEPLOY_SSH_PASSWORD")
    key_path = env.get("DEPLOY_SSH_KEY")
    port = int(env.get("DEPLOY_SSH_PORT", "22"))

    if not password and not key_path:
        print("Set DEPLOY_SSH_KEY or deploy credentials in .env")
        return 1

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs: dict = {"hostname": host, "port": port, "username": user, "timeout": 30}
    if key_path:
        expanded = Path(key_path).expanduser()
        connect_kwargs["key_filename"] = str(expanded)
    if password:
        connect_kwargs["password"] = password

    print(f"Connecting to {user}@{host}:{port}...")
    ssh.connect(**connect_kwargs)

    try:
        with tempfile.NamedTemporaryFile(suffix=".tgz", delete=False) as tmp:
            archive_path = Path(tmp.name)

        print("Packing server/...")
        with tarfile.open(archive_path, "w:gz") as tar:
            for path in SERVER.rglob("*"):
                if path.is_dir():
                    continue
                rel = path.relative_to(SERVER).as_posix()
                if rel.startswith("node_modules/") or rel == ".env":
                    continue
                tar.add(path, arcname=f"./{rel}")

        sftp = ssh.open_sftp()
        try:
            ensure_remote_dir(sftp, REMOTE_PATH)
            remote_archive = posixpath.join(REMOTE_PATH, "server.tgz")
            print(f"Uploading archive to {remote_archive}...")
            sftp.put(str(archive_path), remote_archive)
        finally:
            sftp.close()
            archive_path.unlink(missing_ok=True)

        remote_script = " && ".join(
            [
                f"cd {REMOTE_PATH}",
                "tar -xzf server.tgz",
                "rm -f server.tgz",
                "npm install --omit=dev",
                "if pm2 describe pvz-api >/dev/null 2>&1; then pm2 restart pvz-api --update-env; else pm2 start ecosystem.config.cjs; fi",
                "pm2 save",
                "for i in 1 2 3 4 5; do curl -sf http://127.0.0.1:3000/ && exit 0; sleep 2; done; exit 1",
            ]
        )
        print("Installing dependencies and restarting PM2...")
        code = run_remote(ssh, remote_script)
        if code != 0:
            raise RuntimeError(f"Remote deploy failed ({code})")
        print("\nDeploy OK")
        return 0
    finally:
        ssh.close()


if __name__ == "__main__":
    raise SystemExit(main())
