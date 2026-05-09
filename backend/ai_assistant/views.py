from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import AIProviderConfiguration, AIPrompt
from .services import generate_text


TASK_CHOICES = ['customer_report', 'diagnosis', 'service_done', 'email', 'whatsapp', 'template_email', 'template_whatsapp']


class AssistSerializer(serializers.Serializer):
    task = serializers.ChoiceField(choices=TASK_CHOICES)
    draft = serializers.CharField(required=False, allow_blank=True)
    context = serializers.CharField(required=False, allow_blank=True)
    prompt_id = serializers.IntegerField(required=False, allow_null=True)


class AssistView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        task = request.query_params.get('task')
        prompt_qs = AIPrompt.objects.filter(is_active=True)
        if task in TASK_CHOICES:
            prompt_qs = prompt_qs.filter(task__in=[task, AIPrompt.Task.GENERAL])
        prompts = [
            {
                'id': prompt.id,
                'name': prompt.name,
                'task': prompt.task,
                'task_label': prompt.get_task_display(),
                'description': prompt.description,
                'is_default': prompt.is_default,
            }
            for prompt in prompt_qs.order_by('-is_default', 'task', 'name')
        ]
        active_config = AIProviderConfiguration.objects.filter(is_enabled=True).exclude(api_key='').filter(is_default=True).first() or AIProviderConfiguration.objects.filter(is_enabled=True).exclude(api_key='').first()
        return Response({
            'prompts': prompts,
            'provider_label': active_config.get_provider_display() if active_config else '',
            'model_name': active_config.model_name if active_config else '',
            'has_provider': bool(active_config),
        })

    def post(self, request):
        serializer = AssistSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            data = generate_text(
                task=serializer.validated_data['task'],
                draft=serializer.validated_data.get('draft', ''),
                context=serializer.validated_data.get('context', ''),
                prompt_id=serializer.validated_data.get('prompt_id'),
            )
        except DjangoValidationError as exc:
            return Response({'detail': '; '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)
