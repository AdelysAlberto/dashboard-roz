"""HTTP Basic auth for roz.

The dashboard exposes pilot (an agent runtime), the services board and every
transcript it scans, so publishing it beyond loopback without a credential is
the same as publishing a shell. This module is the whole gate: one ASGI
middleware that answers `401` with a Basic challenge on HTTP and closes the
WebSocket handshake with `1008`.

Browsers do not attach an `Authorization` header to a WebSocket handshake on
every engine, so a successful Basic login also plants an HMAC cookie derived
from the same credentials. No server state, no session store: the cookie is
valid while the password is.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import PlainTextResponse

COOKIE_NAME = "roz_auth"
COOKIE_MAX_AGE = 7 * 24 * 3600
REALM = "roz"
_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def token(user: str, password: str) -> str:
    """Cookie value: HMAC over the credential pair, keyed by the password itself."""
    key = f"roz:{user}:{REALM}".encode()
    return hmac.new(password.encode(), key, hashlib.sha256).hexdigest()


def parse_basic(header: str | None) -> tuple[str, str] | None:
    """Decode `Basic base64(user:pass)`; `None` when absent or malformed."""
    if not header:
        return None
    scheme, _, payload = header.partition(" ")
    if scheme.lower() != "basic" or not payload:
        return None
    try:
        raw = base64.b64decode(payload.strip(), validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None
    user, sep, password = raw.partition(":")
    if not sep:
        return None
    return user, password


def parse_cookies(header: str | None) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for chunk in (header or "").split(";"):
        key, sep, value = chunk.strip().partition("=")
        if sep and key:
            pairs[key] = value
    return pairs


def _client_host(scope: dict) -> str:
    client = scope.get("client")
    if not client:
        return ""
    return str(client[0])


def _challenge() -> PlainTextResponse:
    return PlainTextResponse(
        "roz: authentication required\n",
        status_code=401,
        headers={"WWW-Authenticate": f'Basic realm="{REALM}", charset="UTF-8"'},
    )


class BasicAuthMiddleware:
    """Reject every unauthenticated HTTP request and WebSocket handshake.

    `allow_loopback` keeps the documented local tools (`curl 127.0.0.1:PORT`)
    working without a credential; the socket is still bound to 0.0.0.0, so the
    network path is the one that must authenticate.
    """

    def __init__(self, app, user: str, password: str, allow_loopback: bool = True):
        self.app = app
        self.user = user
        self.password = password
        self.allow_loopback = allow_loopback
        self._token = token(user, password)

    # ── credential checks ────────────────────────────────────────────

    def _check_basic(self, header: str | None) -> bool:
        parsed = parse_basic(header)
        if parsed is None:
            return False
        user, password = parsed
        return hmac.compare_digest(f"{user}\0{password}", f"{self.user}\0{self.password}")

    def _check_cookie(self, header: str | None) -> bool:
        value = parse_cookies(header).get(COOKIE_NAME, "")
        return bool(value) and hmac.compare_digest(value, self._token)

    def _is_loopback(self, scope: dict) -> bool:
        return self.allow_loopback and _client_host(scope) in _LOOPBACK

    # ── ASGI plumbing ────────────────────────────────────────────────

    def _plant_cookie(self, send):
        async def wrapped(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.append(
                    "set-cookie",
                    f"{COOKIE_NAME}={self._token}; Path=/; HttpOnly; SameSite=Lax; "
                    f"Max-Age={COOKIE_MAX_AGE}",
                )
            await send(message)

        return wrapped

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        if self._is_loopback(scope):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        via_header = self._check_basic(headers.get("authorization"))
        if not via_header and not self._check_cookie(headers.get("cookie")):
            await self._reject(scope, receive, send)
            return
        if via_header and scope["type"] == "http":
            await self.app(scope, receive, self._plant_cookie(send))
            return
        await self.app(scope, receive, send)

    async def _reject(self, scope, receive, send):
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008, "reason": "authentication required"})
            return
        await _challenge()(scope, receive, send)


def credentials_from_env(allow_loopback: bool = True) -> dict[str, object] | None:
    """Middleware kwargs from ROZ_USER/ROZ_PASS, or `None` when either is unset."""
    user = os.environ.get("ROZ_USER", "").strip()
    password = os.environ.get("ROZ_PASS", "")
    if not user or not password:
        return None
    return {"user": user, "password": password, "allow_loopback": allow_loopback}
