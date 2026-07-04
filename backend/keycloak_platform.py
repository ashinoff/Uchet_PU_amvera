"""Единый вход через платформу (Keycloak) — проверка access-токена.

Проверяем JWT платформы по публичным ключам Keycloak (JWKS): подпись, iss,
exp и azp. У public-клиента `web-desktop` в access-токене aud обычно
"account", поэтому aud НЕ требуем — вместо этого проверяем azp.
JWKS кэшируется в процессе (PyJWKClient сам кэширует ключи), Keycloak
не дёргается на каждый запрос. Сам токен никогда не логируется и не
сохраняется — в логи попадают только причины отказа.

Зависимости: PyJWT (уже используется в проекте) + cryptography
(добавить в requirements.txt: `cryptography`).

Переменные окружения (значения по умолчанию — боевые адреса платформы):
  PLATFORM_SSO       — true/false, фиче-флаг (по умолчанию false)
  KEYCLOAK_URL       — https://keycloak-ashinoff.amvera.io
  KEYCLOAK_REALM     — platform
  KEYCLOAK_AZP       — web-desktop
  PLATFORM_ORIGIN    — https://sue-system-ashinoff.amvera.io
  SVET_ACCESS_ROLE   — realm-роль, дающая доступ к приложению (svet-user)
"""
import os
import logging

import jwt as pyjwt
from jwt import PyJWKClient, InvalidTokenError

logger = logging.getLogger("platform_sso")

PLATFORM_SSO = os.getenv("PLATFORM_SSO", "false").lower() in ("1", "true", "yes")
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "https://keycloak-ashinoff.amvera.io").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "platform")
KEYCLOAK_AZP = os.getenv("KEYCLOAK_AZP", "web-desktop")
PLATFORM_ORIGIN = os.getenv("PLATFORM_ORIGIN", "https://sue-system-ashinoff.amvera.io")
SVET_ACCESS_ROLE = os.getenv("SVET_ACCESS_ROLE", "svet-user")

KEYCLOAK_ISSUER = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"

# PyJWKClient кэширует ключи и сам перечитывает JWKS при неизвестном kid.
_jwk_client = PyJWKClient(KEYCLOAK_JWKS_URL, cache_keys=True, lifespan=3600)


class TokenError(Exception):
    """Токен не прошёл проверку. Сообщение безопасно логировать (без токена)."""


def verify_token(token: str) -> dict:
    """Вернуть проверенные claims или бросить TokenError с безопасной причиной."""
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
    except Exception as exc:  # noqa: BLE001 — сетевые/kid ошибки
        raise TokenError(f"не удалось получить ключ подписи ({exc.__class__.__name__})")

    try:
        claims = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=KEYCLOAK_ISSUER,
            options={"verify_aud": False},  # public-клиент: aud обычно "account"
        )
    except InvalidTokenError as exc:
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
