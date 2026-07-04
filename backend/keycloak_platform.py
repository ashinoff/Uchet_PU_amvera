"""Единый вход через платформу (Keycloak) — проверка access-токена.

Проверяем JWT платформы по публичным ключам Keycloak (JWKS): подпись, iss,
exp и azp. У public-клиента `web-desktop` в access-токене aud обычно
"account", поэтому aud НЕ требуем — вместо этого проверяем azp.
JWKS кэшируется в процессе и перечитывается при неизвестном kid или после
TTL — Keycloak не дёргается на каждый запрос. Сам токен никогда не
логируется и не сохраняется — только причины отказа.

Библиотека: python-jose (уже используется в main.py) — новых зависимостей нет.

Переменные окружения (значения по умолчанию — боевые адреса платформы):
  PLATFORM_SSO       — true/false, фиче-флаг (по умолчанию false)
  KEYCLOAK_URL       — https://keycloak-ashinoff.amvera.io
  KEYCLOAK_REALM     — platform
  KEYCLOAK_AZP       — web-desktop
  PLATFORM_ORIGIN    — https://sue-system-ashinoff.amvera.io
  SVET_ACCESS_ROLE   — realm-роль, дающая доступ к приложению (svet-user)
"""
import os
import json
import time
import urllib.request
from typing import Optional

from jose import JWTError, jwt

PLATFORM_SSO = os.getenv("PLATFORM_SSO", "false").lower() in ("1", "true", "yes")
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://keycloak-ashinoff.amvera.io").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "platform")
KEYCLOAK_AZP = os.getenv("KEYCLOAK_AZP", "web-desktop")
PLATFORM_ORIGIN = os.getenv("PLATFORM_ORIGIN", "https://sue-system-ashinoff.amvera.io")
SVET_ACCESS_ROLE = os.getenv("SVET_ACCESS_ROLE", "svet-user")

KEYCLOAK_ISSUER = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}


class TokenError(Exception):
    """Токен не прошёл проверку. Сообщение безопасно логировать (без токена)."""


def _fetch_jwks() -> dict:
    req = urllib.request.Request(KEYCLOAK_JWKS_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get_jwks(force: bool = False) -> dict:
    now = time.time()
    stale = (now - _jwks_cache["fetched_at"]) > _JWKS_TTL_SECONDS
    if force or _jwks_cache["keys"] is None or stale:
        _jwks_cache["keys"] = _fetch_jwks()
        _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


def _find_key(kid: str, jwks: dict) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def verify_token(token: str) -> dict:
    """Вернуть проверенные claims или бросить TokenError с безопасной причиной."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise TokenError(f"повреждённый заголовок токена ({exc.__class__.__name__})")

    kid = header.get("kid")
    if not kid:
        raise TokenError("в заголовке токена нет kid")

    key = _find_key(kid, _get_jwks())
    if key is None:
        # Ключи могли ротироваться — один раз перечитываем JWKS.
        key = _find_key(kid, _get_jwks(force=True))
    if key is None:
        raise TokenError("ключ подписи не найден в JWKS")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            issuer=KEYCLOAK_ISSUER,
            options={"verify_aud": False},  # public-клиент: aud обычно "account"
        )
    except JWTError as exc:
        # Покрывает плохую подпись / просрочен / не тот issuer.
        raise TokenError(f"невалидный токен ({exc.__class__.__name__})")

    azp = claims.get("azp")
    if azp != KEYCLOAK_AZP:
        raise TokenError(f"неожиданный azp: {azp!r}")

    return claims


def identity_from_claims(claims: dict) -> dict:
    """Личность пользователя платформы из проверенных claims."""
    return {
        "keycloak_id": claims.get("sub"),
        "username": claims.get("preferred_username"),
        "email": claims.get("email"),
        "full_name": claims.get("name"),
        "roles": (claims.get("realm_access") or {}).get("roles", []),
    }


def has_svet_access(roles) -> bool:
    """True, если в токене есть роль доступа к «Светлячку»."""
    return SVET_ACCESS_ROLE in roles
