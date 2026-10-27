"""Production WSGI entry point for the teaching laboratory."""

import logging
import mimetypes
from pathlib import Path
import sqlite3
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "reference-database" / "src"))
from adapters.api import respond

PUBLIC_DIRECTORIES = {"css", "js", "assets", "data"}
ENDPOINTS = {"status", "search", "interpret", "disease", "chromosome", "chromosome-counts", "coverage"}


def application(environ, start_response):
    import json

    method = environ.get("REQUEST_METHOD", "GET")
    path = unquote(environ.get("PATH_INFO", "/"))

    def reply(status, body, content_type="application/json"):
        headers = [("Content-Type", content_type), ("Content-Length", str(len(body))),
                   ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
                   ("Referrer-Policy", "no-referrer")]
        start_response(status, headers)
        return [b"" if method == "HEAD" else body]

    if method not in {"GET", "HEAD"}:
        return reply("405 Method Not Allowed", b'{"error":"Method not allowed"}')
    if path == "/healthz":
        try:
            database = ROOT / "reference-database/data/cytogenetics.sqlite"
            with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
                connection.execute("SELECT disease_id FROM diseases LIMIT 1").fetchone()
            return reply("200 OK", b'{"healthy":true}')
        except Exception:
            logging.exception("Reference database health check failed")
            return reply("503 Service Unavailable", b'{"healthy":false}')
    if path.startswith("/api/reference/"):
        if path.removeprefix("/api/reference/") not in ENDPOINTS:
            return reply("404 Not Found", b'{"available":false}')
        query = environ.get("QUERY_STRING", "")
        if len(query) > 16000:
            return reply("414 URI Too Long", b'{"available":false}')
        try:
            payload = respond(path, query)
            if payload.get("available") is False:
                return reply("503 Service Unavailable", b'{"available":false,"reason":"Reference service unavailable."}')
            return reply("200 OK", json.dumps(payload).encode())
        except Exception:
            logging.exception("Reference request failed")
            return reply("503 Service Unavailable", b'{"available":false}')
    relative = "index.html" if path == "/" else path.lstrip("/")
    parts = Path(relative).parts
    if not parts or any(part.startswith(".") for part in parts):
        return reply("404 Not Found", b"Not found", "text/plain")
    if relative != "index.html" and parts[0] not in PUBLIC_DIRECTORIES:
        return reply("404 Not Found", b"Not found", "text/plain")
    target = (ROOT / relative).resolve()
    if not target.is_relative_to(ROOT) or not target.is_file():
        return reply("404 Not Found", b"Not found", "text/plain")
    content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    if target.suffix == ".js":
        content_type = "text/javascript"
    return reply("200 OK", target.read_bytes(), content_type)
