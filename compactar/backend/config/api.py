from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.views import exception_handler


def _stringify(value):
    if isinstance(value, list):
        return [_stringify(item) for item in value]
    if isinstance(value, dict):
        return {key: _stringify(item) for key, item in value.items()}
    return str(value)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None and isinstance(exc, DjangoValidationError):
        detail = getattr(exc, "message_dict", None) or getattr(exc, "messages", None) or str(exc)
        exc = DRFValidationError(detail)
        response = exception_handler(exc, context)
    if response is None:
        return None

    status_code = response.status_code
    data = response.data

    if isinstance(data, dict):
        if "detail" in data and len(data) == 1:
            message = str(data["detail"])
            fields = {}
        else:
            message = "Não foi possível processar a solicitação. Verifique os campos informados."
            fields = _stringify(data)
    else:
        message = str(data)
        fields = {}

    if status_code == 401:
        error_type = "authentication_error"
        message = message or "Autenticação necessária."
    elif status_code == 403:
        error_type = "permission_error"
        message = message or "Você não tem permissão para executar esta ação."
    elif status_code == 404:
        error_type = "not_found"
        message = message or "Registro não encontrado."
    elif status_code == 400:
        error_type = "validation_error"
    else:
        error_type = "server_error" if status_code >= 500 else "api_error"

    response.data = {
        "type": error_type,
        "message": message,
        "fields": fields,
        "status_code": status_code,
    }
    return response
