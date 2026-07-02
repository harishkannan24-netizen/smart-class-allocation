from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsSuperAdmin(BasePermission):
    """Full access — Super Admin only."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_super_admin)


class IsSuperAdminOrReadOnly(BasePermission):
    """Anyone authenticated can read; only Super Admin can write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_super_admin


class IsSuperAdminOrDeptAdmin(BasePermission):
    """Super Admin has full access; Department Admin has access limited to their own department."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.is_super_admin or user.is_dept_admin

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_super_admin:
            return True
        if request.method in SAFE_METHODS:
            return True
        # Department admins may only modify objects tied to their own department
        obj_department = getattr(obj, "department", None)
        return bool(user.is_dept_admin and obj_department and obj_department == user.department)


class IsOwnerOrAdmin(BasePermission):
    """Object-level: user must own the record, or be a Super/Dept Admin."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_super_admin:
            return True
        owner = getattr(obj, "user", None) or getattr(obj, "created_by", None)
        return owner == user
