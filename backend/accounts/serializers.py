from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "phone", "department", "department_name",
            "is_active", "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            "username", "email", "first_name", "last_name",
            "password", "password2", "role", "phone", "department",
        ]

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password2"):
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        # Students self-register as STUDENT/FACULTY only; SUPER_ADMIN/DEPT_ADMIN
        # accounts should be created/promoted by an existing Super Admin.
        request = self.context.get("request")
        requested_role = attrs.get("role", User.Role.STUDENT)
        if requested_role in (User.Role.SUPER_ADMIN, User.Role.DEPT_ADMIN):
            if not (request and request.user.is_authenticated and request.user.is_super_admin):
                raise serializers.ValidationError(
                    {"role": "Only a Super Admin can create Super Admin or Department Admin accounts."}
                )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role and profile info directly into the JWT payload and login response."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        token["full_name"] = user.get_full_name()
        token["department_id"] = user.department_id
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])
