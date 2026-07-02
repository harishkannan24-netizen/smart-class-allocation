from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsSuperAdmin, IsSuperAdminOrDeptAdmin, IsSuperAdminOrReadOnly
from .importers import (
    import_departments, import_rooms, import_sections,
    import_timetable_entries,
)
from .models import (
    Block, Campus, Department, Floor, Room, Section,
    TemporaryAllocation, TimetableEntry,
)
from .serializers import (
    BlockSerializer, CampusSerializer, DepartmentSerializer, FloorSerializer,
    FreeRoomQuerySerializer, RoomSerializer, SectionSerializer,
    TemporaryAllocationSerializer, TimetableEntrySerializer,
)
from .services import find_free_rooms, get_room_status_for_slot, recommend_best_room

User = get_user_model()


class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [IsSuperAdminOrReadOnly]


class BlockViewSet(viewsets.ModelViewSet):
    queryset = Block.objects.select_related("campus").all()
    serializer_class = BlockSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filterset_fields = ["campus"]


class FloorViewSet(viewsets.ModelViewSet):
    queryset = Floor.objects.select_related("block").all()
    serializer_class = FloorSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    filterset_fields = ["block"]


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsSuperAdminOrReadOnly]
    search_fields = ["name", "code"]


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.select_related("floor__block__campus", "department").all()
    serializer_class = RoomSerializer
    permission_classes = [IsSuperAdminOrDeptAdmin]
    filterset_fields = ["floor", "floor__block", "department", "room_type", "status"]
    search_fields = ["room_number"]

    @action(detail=True, methods=["get"], url_path="status")
    def slot_status(self, request, pk=None):
        """Check this room's availability for a given day/start_time/end_time."""
        room = self.get_object()
        serializer = FreeRoomQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = get_room_status_for_slot(room, data["day"], data["start_time"], data["end_time"])
        result["room"] = RoomSerializer(room).data
        if result.get("occupying_section"):
            result["occupying_section"] = SectionSerializer(result["occupying_section"]).data
        return Response(result)


class SectionViewSet(viewsets.ModelViewSet):
    queryset = Section.objects.select_related("department", "permanent_room").all()
    serializer_class = SectionSerializer
    permission_classes = [IsSuperAdminOrDeptAdmin]
    filterset_fields = ["department", "year"]


class TimetableEntryViewSet(viewsets.ModelViewSet):
    queryset = TimetableEntry.objects.select_related("section", "room").all()
    serializer_class = TimetableEntrySerializer
    permission_classes = [IsSuperAdminOrDeptAdmin]
    filterset_fields = ["section", "room", "day", "activity_type"]


class TemporaryAllocationViewSet(viewsets.ModelViewSet):
    queryset = TemporaryAllocation.objects.select_related("room", "section", "requested_by").all()
    serializer_class = TemporaryAllocationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["room", "section", "day", "status"]

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)

    @action(detail=True, methods=["post"], permission_classes=[IsSuperAdminOrDeptAdmin])
    def approve(self, request, pk=None):
        allocation = self.get_object()
        allocation.status = TemporaryAllocation.Status.APPROVED
        allocation.approved_by = request.user
        allocation.save()
        return Response(TemporaryAllocationSerializer(allocation).data)

    @action(detail=True, methods=["post"], permission_classes=[IsSuperAdminOrDeptAdmin])
    def reject(self, request, pk=None):
        allocation = self.get_object()
        allocation.status = TemporaryAllocation.Status.REJECTED
        allocation.approved_by = request.user
        allocation.save()
        return Response(TemporaryAllocationSerializer(allocation).data)


class FreeRoomSearchView(APIView):
    """GET /api/campus/free-rooms/?day=WED&start_time=10:00&end_time=12:00&..."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = FreeRoomQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        rooms = find_free_rooms(
            day=d["day"], start_time=d["start_time"], end_time=d["end_time"],
            campus_id=d.get("campus_id"), block_id=d.get("block_id"), floor_id=d.get("floor_id"),
            room_type=d.get("room_type"), min_capacity=d.get("min_capacity"),
            department_id=d.get("department_id"),
        )
        return Response(RoomSerializer(rooms, many=True).data)


class RecommendRoomView(APIView):
    """POST /api/campus/recommend-room/ — best-fit room for a temporary allocation request."""
    permission_classes = [IsSuperAdminOrDeptAdmin]

    def post(self, request):
        serializer = FreeRoomQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        room = recommend_best_room(
            day=d["day"], start_time=d["start_time"], end_time=d["end_time"],
            required_capacity=d.get("min_capacity"),
            preferred_department_id=d.get("department_id"),
            preferred_block_id=d.get("block_id"),
            room_type=d.get("room_type"),
        )
        if not room:
            return Response({"detail": "No suitable room available."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RoomSerializer(room).data)


class ImportDepartmentsView(APIView):
    permission_classes = [IsSuperAdminOrDeptAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Please upload a file under the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            count = import_departments(uploaded_file)
            return Response({"imported": count})
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else exc.messages or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ImportRoomsView(APIView):
    permission_classes = [IsSuperAdminOrDeptAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Please upload a file under the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            count = import_rooms(uploaded_file)
            return Response({"imported": count})
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else exc.messages or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ImportSectionsView(APIView):
    permission_classes = [IsSuperAdminOrDeptAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Please upload a file under the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            count = import_sections(uploaded_file)
            return Response({"imported": count})
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else exc.messages or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ImportTimetableEntriesView(APIView):
    permission_classes = [IsSuperAdminOrDeptAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Please upload a file under the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            count = import_timetable_entries(uploaded_file)
            return Response({"imported": count})
        except ValidationError as exc:
            return Response({"detail": exc.message_dict if hasattr(exc, "message_dict") else exc.messages or str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class DashboardStatsView(APIView):
    """GET /api/campus/dashboard/ — summary cards for the ERP-style dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.localtime()
        today_code = now.strftime("%a").upper()[:3]

        total_rooms = Room.objects.count()
        occupied = Room.objects.filter(status=Room.Status.OCCUPIED).count()
        maintenance = Room.objects.filter(status=Room.Status.MAINTENANCE).count()
        available = total_rooms - occupied - maintenance

        return Response({
            "total_blocks": Block.objects.count(),
            "total_floors": Floor.objects.count(),
            "total_rooms": total_rooms,
            "occupied_rooms": occupied,
            "available_rooms": max(available, 0),
            "todays_classes": TimetableEntry.objects.filter(
                day=today_code, activity_type=TimetableEntry.ActivityType.LECTURE
            ).count(),
            "todays_labs": TimetableEntry.objects.filter(
                day=today_code, activity_type=TimetableEntry.ActivityType.LAB
            ).count(),
            "temporary_allocations_today": TemporaryAllocation.objects.filter(
                day=today_code, status=TemporaryAllocation.Status.APPROVED
            ).count(),
            "pending_requests": TemporaryAllocation.objects.filter(
                status=TemporaryAllocation.Status.PENDING
            ).count(),
            "total_departments": Department.objects.count(),
            "total_sections": Section.objects.count(),
        })
