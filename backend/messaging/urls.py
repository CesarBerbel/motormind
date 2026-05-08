from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AutomationViewSet,
    ChannelConfigurationView,
    ContactGroupViewSet,
    ContactViewSet,
    DashboardView,
    ManualSendView,
    MeView,
    PasswordSetupConfirmView,
    MessageLogViewSet,
    MessageTemplateViewSet,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("contact-groups", ContactGroupViewSet, basename="contact-group")
router.register("contacts", ContactViewSet, basename="contact")
router.register("templates", MessageTemplateViewSet, basename="template")
router.register("automations", AutomationViewSet, basename="automation")
router.register("message-logs", MessageLogViewSet, basename="message-log")

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("settings/channel/", ChannelConfigurationView.as_view(), name="channel-config"),
    path("send/manual/", ManualSendView.as_view(), name="manual-send"),
    path("password-setup/confirm/", PasswordSetupConfirmView.as_view(), name="password-setup-confirm"),
]
urlpatterns += router.urls
