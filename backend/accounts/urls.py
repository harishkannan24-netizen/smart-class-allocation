from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import (
    ChangePasswordView,
    CustomTokenObtainPairView,
    MeView,
    RegisterView,
    UserManagementViewSet,
)

router = DefaultRouter()
router.register(r"users", UserManagementViewSet, basename="user-management")

urlpatterns = [
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/logout/", TokenBlacklistView.as_view(), name="token_blacklist"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="change_password"),
    path("", include(router.urls)),
]
