#!/usr/bin/env python3
"""Local viewer for the reference database. It does not serve the teaching app."""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
VIEWER = ROOT / "viewer"
sys.path.insert(0, str(ROOT / "src"))

from search.reference_database import (  # noqa: E402
    get_associated_abnormalities,
    get_disease_details,
    get_fish_probes,
    provenance,
    search,
)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/search":
            params = parse_qs(parsed.query)
            payload = search(params.get("type", ["disease"])[0], params.get("q", [""])[0])
            return self.send_json(payload)
        if parsed.path == "/api/disease":
            disease_id = parse_qs(parsed.query).get("id", [""])[0]
            return self.send_json(get_disease_details(disease_id))
        if parsed.path == "/api/abnormalities":
            disease_id = parse_qs(parsed.query).get("id", [""])[0]
            return self.send_json(get_associated_abnormalities(disease_id))
        if parsed.path == "/api/fish":
            disease_id = parse_qs(parsed.query).get("id", [""])[0]
            return self.send_json({"results": get_fish_probes(disease_id)})
        if parsed.path == "/api/provenance":
            return self.send_json(provenance())
        relative = "index.html" if parsed.path in ("", "/") else parsed.path.lstrip("/")
        target = (VIEWER / relative).resolve()
        if not str(target).startswith(str(VIEWER.resolve())) or not target.is_file():
            self.send_error(404)
            return
        kind = {".html": "text/html", ".css": "text/css", ".js": "text/javascript"}.get(target.suffix, "text/plain")
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{kind}; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"reference viewer http://127.0.0.1:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
