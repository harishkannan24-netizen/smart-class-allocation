from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model with role-based access control.

    Roles:
      - SUPER_ADMIN: full control over the platform
      - DEPT_ADMIN: manages only their own department
      - FACULTY: views timetables, searches rooms
      - STUDENT: read-only search/view access
    """

    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        DEPT_ADMIN = "DEPT_ADMIN", "Department Admin"
        FACULTY = "FACULTY", "Faculty"
        STUDENT = "STUDENT", "Student"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    phone = models.CharField(max_length=20, blank=True, null=True)
    department = models.ForeignKey(
        "campus.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        help_text="Required for Department Admin and Faculty roles.",
    )
    is_active_staff = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_super_admin(self):
        return self.role == self.Role.SUPER_ADMIN

    @property
    def is_dept_admin(self):
        return self.role == self.Role.DEPT_ADMIN

    @property
    def is_faculty(self):
        return self.role == self.Role.FACULTY

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
