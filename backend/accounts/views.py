from django.contrib.auth import get_user_model
from rest_framework import generics, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .permissions import IsSuperAdmin
from .serializers import (
    ChangePasswordSerializer,
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class CustomTokenObtainPairView(TokenObtainPairView):
    """Login endpoint — returns access + refresh tokens with role embedded, plus user profile."""
    serializer_class = CustomTokenObtainPairSerializer


class RegisterView(generics.CreateAPIView):
    """
    Public registration for Student / Faculty accounts.
    Super Admin / Department Admin accounts must be created by an authenticated Super Admin.
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = []  # open endpoint; role escalation guarded in serializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    """Get or update the currently authenticated user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.validated_data.pop("role", None)  # prevent self-promotion
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"old_password": "Incorrect password."}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password updated successfully."})


class UserManagementViewSet(viewsets.ModelViewSet):
    """Super Admin only: manage all user accounts (create, promote, deactivate)."""
    queryset = User.objects.all().select_related("department").order_by("-date_joined")
    serializer_class = UserSerializer
    permission_classes = [IsSuperAdmin]
    filterset_fields = ["role", "department", "is_active"]
    search_fields = ["username", "email", "first_name", "last_name"]
