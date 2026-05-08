import os
from pathlib import Path

from celery import current_app
from django.conf import settings
from django.core.cache import cache
from django.db import connections
from django.db.migrations.executor import MigrationExecutor
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


def _ok(message="ok", **extra):
    return {"status": "ok", "message": message, **extra}


def _warning(message, **extra):
    return {"status": "warning", "message": message, **extra}


def _error(message, **extra):
    return {"status": "error", "message": message, **extra}


def check_database():
    try:
        connection = connections["default"]
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return _ok(engine=connection.settings_dict.get("ENGINE", ""), name=str(connection.settings_dict.get("NAME", "")))
    except Exception as exc:
        return _error("Banco de dados indisponível.", error=str(exc))


def check_migrations():
    try:
        connection = connections["default"]
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        if pending:
            return _warning("Existem migrations pendentes.", pending_count=len(pending), pending=[f"{migration.app_label}.{migration.name}" for migration, _ in pending[:20]])
        return _ok("Todas as migrations estão aplicadas.")
    except Exception as exc:
        return _error("Não foi possível verificar migrations.", error=str(exc))


def check_media_storage():
    try:
        media_root = Path(settings.MEDIA_ROOT)
        media_root.mkdir(parents=True, exist_ok=True)
        probe = media_root / ".healthcheck"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return _ok(path=str(media_root))
    except Exception as exc:
        return _error("Diretório de mídia não está gravável.", path=str(settings.MEDIA_ROOT), error=str(exc))


def check_cache():
    try:
        key = "healthcheck:cache"
        cache.set(key, "ok", timeout=10)
        if cache.get(key) != "ok":
            return _warning("Cache respondeu, mas não retornou o valor esperado.")
        return _ok("Cache funcional.")
    except Exception as exc:
        return _warning("Cache indisponível ou não configurado.", error=str(exc))


def check_redis_broker():
    broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
    if not broker_url.startswith("redis://") and not broker_url.startswith("rediss://"):
        return _warning("Broker Celery não usa Redis ou não foi informado.", broker_url=broker_url)
    try:
        import redis

        client = redis.from_url(broker_url, socket_connect_timeout=1, socket_timeout=1)
        client.ping()
        return _ok("Redis respondeu ao ping.", broker_url=broker_url)
    except Exception as exc:
        return _warning("Redis/Broker não respondeu. Tarefas assíncronas podem não executar.", broker_url=broker_url, error=str(exc))


def check_celery_configuration():
    try:
        app = current_app
        configured_broker = app.conf.broker_url or getattr(settings, "CELERY_BROKER_URL", "")
        beat_schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {}) or {}
        return _ok("Celery configurado.", broker_url=configured_broker, scheduled_tasks=sorted(beat_schedule.keys()))
    except Exception as exc:
        return _warning("Não foi possível ler configuração do Celery.", error=str(exc))


def check_environment():
    return _ok(
        debug=settings.DEBUG,
        allowed_hosts=settings.ALLOWED_HOSTS,
        secure_ssl_redirect=getattr(settings, "SECURE_SSL_REDIRECT", False),
        session_cookie_secure=getattr(settings, "SESSION_COOKIE_SECURE", False),
        csrf_cookie_secure=getattr(settings, "CSRF_COOKIE_SECURE", False),
    )


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        deep = str(request.query_params.get("deep", "false")).lower() in {"1", "true", "yes", "sim"}
        checks = {
            "database": check_database(),
            "migrations": check_migrations(),
            "media_storage": check_media_storage(),
            "environment": check_environment(),
            "celery": check_celery_configuration(),
        }
        if deep:
            checks["cache"] = check_cache()
            checks["redis_broker"] = check_redis_broker()

        has_error = any(item["status"] == "error" for item in checks.values())
        has_warning = any(item["status"] == "warning" for item in checks.values())
        overall_status = "error" if has_error else "warning" if has_warning else "ok"
        http_status = 503 if has_error else 200
        return Response(
            {
                "status": overall_status,
                "version": getattr(settings, "SPECTACULAR_SETTINGS", {}).get("VERSION", "1.0.0"),
                "service": "Oficina Admin API",
                "environment": os.getenv("ENVIRONMENT", "development"),
                "checks": checks,
            },
            status=http_status,
        )
