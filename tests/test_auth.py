"""LAN gate tests: the Basic challenge, the HMAC cookie and the WS close.

The middleware is pure ASGI, so it is driven with a hand-rolled scope/receive/
send trio instead of a TestClient: no socket, no event loop dependence.
Run with: `.venv/bin/python -m unittest discover -s tests -t .`
"""

from __future__ import annotations

import asyncio
import base64
import unittest

from server import auth

LAN = ("192.168.1.50", 51234)
LOOPBACK = ("127.0.0.1", 51234)


def basic(user: str, password: str) -> str:
    raw = f"{user}:{password}".encode()
    return "Basic " + base64.b64encode(raw).decode()


class Harness:
    """Collects what the app and the middleware wrote to the client."""

    def __init__(self, kind: str = "http", client: tuple[str, int] = LAN, headers: dict | None = None):
        self.calls: list[str] = []
        self.sent: list[dict] = []
        self.scope = {
            "type": kind,
            "client": client,
            "path": "/api/docs",
            "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        }

    async def app(self, scope, receive, send):
        self.calls.append("app")
        if scope["type"] == "websocket":
            await send({"type": "websocket.accept"})
            return
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"text/plain")]})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive(self):
        return {"type": "http.request"}

    async def send(self, message):
        self.sent.append(message)

    def run(self, allow_loopback: bool = True):
        mw = auth.BasicAuthMiddleware(self.app, "adely", "s3cret", allow_loopback=allow_loopback)
        asyncio.run(mw(self.scope, self.receive, self.send))
        return self

    # ── assertions helpers ───────────────────────────────────────────
    def start(self) -> dict:
        for message in self.sent:
            if message["type"] in ("http.response.start", "websocket.close", "websocket.accept"):
                return message
        raise AssertionError(f"no response start in {self.sent}")

    def header(self, name: str) -> str:
        for key, value in self.start().get("headers", []):
            if key.decode() == name:
                return value.decode()
        return ""


class RejectTest(unittest.TestCase):
    def test_lan_request_without_credentials_gets_401_and_challenge(self):
        h = Harness().run()
        self.assertEqual(h.start()["status"], 401)
        self.assertIn('Basic realm="roz"', h.header("www-authenticate"))
        self.assertEqual(h.calls, [], "the app must never see an unauthenticated request")

    def test_wrong_password_is_rejected(self):
        h = Harness(headers={"authorization": basic("adely", "nope")}).run()
        self.assertEqual(h.start()["status"], 401)
        self.assertEqual(h.calls, [])

    def test_wrong_user_is_rejected(self):
        h = Harness(headers={"authorization": basic("root", "s3cret")}).run()
        self.assertEqual(h.start()["status"], 401)

    def test_websocket_handshake_is_closed_with_1008(self):
        h = Harness(kind="websocket").run()
        self.assertEqual(h.start()["type"], "websocket.close")
        self.assertEqual(h.start()["code"], 1008)
        self.assertEqual(h.calls, [])

    def test_malformed_basic_header_is_rejected(self):
        h = Harness(headers={"authorization": "Basic !!!"}).run()
        self.assertEqual(h.start()["status"], 401)


class AcceptTest(unittest.TestCase):
    def test_valid_basic_passes_and_plants_the_cookie(self):
        h = Harness(headers={"authorization": basic("adely", "s3cret")}).run()
        self.assertEqual(h.start()["status"], 200)
        self.assertIn(f"{auth.COOKIE_NAME}={auth.token('adely', 's3cret')}", h.header("set-cookie"))
        self.assertIn("HttpOnly", h.header("set-cookie"))
        self.assertNotIn("Secure", h.header("set-cookie"), "the LAN instance is plain HTTP; Secure would drop it")

    def test_cookie_alone_is_enough_for_http_and_websocket(self):
        cookie = {f"Cookie": f"{auth.COOKIE_NAME}={auth.token('adely', 's3cret')}"}
        self.assertEqual(Harness(headers=cookie).run().start()["status"], 200)
        ws = Harness(kind="websocket", headers=cookie).run()
        self.assertEqual(ws.start()["type"], "websocket.accept")

    def test_websocket_basic_header_is_accepted(self):
        h = Harness(kind="websocket", headers={"authorization": basic("adely", "s3cret")}).run()
        self.assertEqual(h.start()["type"], "websocket.accept")

    def test_forged_cookie_is_rejected(self):
        cookie = {f"Cookie": f"{auth.COOKIE_NAME}={auth.token('adely', 'other')}"}
        self.assertEqual(Harness(headers=cookie).run().start()["status"], 401)

    def test_loopback_is_exempt_when_asked(self):
        h = Harness(client=LOOPBACK).run(allow_loopback=True)
        self.assertEqual(h.start()["status"], 200)
        self.assertEqual(h.calls, ["app"])

    def test_loopback_is_gated_when_exemption_is_off(self):
        h = Harness(client=LOOPBACK).run(allow_loopback=False)
        self.assertEqual(h.start()["status"], 401)


class ConfigTest(unittest.TestCase):
    def test_credentials_from_env_requires_both_fields(self):
        with self._env({"ROZ_USER": "adely", "ROZ_PASS": ""}):
            self.assertIsNone(auth.credentials_from_env())
        with self._env({"ROZ_USER": "", "ROZ_PASS": "s3cret"}):
            self.assertIsNone(auth.credentials_from_env())
        with self._env({"ROZ_USER": "adely", "ROZ_PASS": "s3cret"}):
            cfg = auth.credentials_from_env()
            assert cfg is not None
            self.assertEqual(cfg["user"], "adely")

    def test_parse_basic_tolerates_garbage(self):
        self.assertIsNone(auth.parse_basic(None))
        self.assertIsNone(auth.parse_basic("Bearer abc"))
        self.assertIsNone(auth.parse_basic("Basic"))
        self.assertEqual(auth.parse_basic(basic("a", "b")), ("a", "b"))

    def _env(self, values: dict):
        import os
        from unittest import mock

        return mock.patch.dict(os.environ, values)


if __name__ == "__main__":
    unittest.main()
