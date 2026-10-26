#!/usr/bin/env python3
"""Local teaching server. Sends no-store so catalog and modules are not cached."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/reference"):
            self._reference(parsed)
            return
        super().do_GET()

    def _reference(self, parsed):
        try:
            module_root = os.path.join(ROOT, "reference-database", "src")
            if module_root not in sys.path:
                sys.path.insert(0, module_root)
            from adapters.api import respond
            payload = respond(parsed.path, parsed.query)
        except Exception as exc:
            payload = {"available": False, "reason": f"Reference module is unavailable. {exc}"}
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if "If-None-Match" in self.headers:
            del self.headers["If-None-Match"]
        return super().send_head()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"Cytogenetics lab at http://127.0.0.1:{port}/  (no-cache)")
    ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
