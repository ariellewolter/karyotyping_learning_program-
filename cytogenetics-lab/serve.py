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
    default_port = int(os.environ.get("PORT", "8765"))
    port = default_port
    server = None
    for attempt_port in range(port, port + 5):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", attempt_port), NoCacheHandler)
            port = attempt_port
            break
        except OSError:
            if "PORT" in os.environ or attempt_port == port + 4:
                print(f"\n[Error] Port {default_port} is already in use by another process.")
                print(f"If the lab is already running, open http://127.0.0.1:{default_port}/ in your browser.")
                print(f"Or specify another port, e.g.: PORT={default_port + 1} python3 serve.py\n")
                sys.exit(1)

    print(f"\nCytogenetics Laboratory is running at:\n  http://127.0.0.1:{port}/\n\nPress Ctrl+C to stop the server.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLaboratory server stopped.")
        sys.exit(0)
