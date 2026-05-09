from django.urls import path
from .views import AssistView

urlpatterns = [path('assist/', AssistView.as_view(), name='ai-assist')]
