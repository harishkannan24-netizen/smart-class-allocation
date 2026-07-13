from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BlockViewSet, CampusViewSet, DashboardStatsView, DepartmentViewSet,
    FloorViewSet, FreeRoomSearchView, ImportDepartmentsView, ImportRoomsView,
    ImportSectionsView, ImportTimetableEntriesView, RecommendRoomView, RoomViewSet,
    SectionViewSet, TemporaryAllocationViewSet, TimetableEntryViewSet,
    RoomChoicesView, RoomsTemplateView,
)
from .views import TimeslotViewSet

router = DefaultRouter()
router.register(r"campuses", CampusViewSet, basename="campus")
router.register(r"blocks", BlockViewSet, basename="block")
router.register(r"floors", FloorViewSet, basename="floor")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"rooms", RoomViewSet, basename="room")
router.register(r"sections", SectionViewSet, basename="section")
router.register(r"timeslots", TimeslotViewSet, basename="timeslot")
router.register(r"timetable-entries", TimetableEntryViewSet, basename="timetable-entry")
router.register(r"temporary-allocations", TemporaryAllocationViewSet, basename="temporary-allocation")

urlpatterns = [
    path("free-rooms/", FreeRoomSearchView.as_view(), name="free-rooms"),
    path("recommend-room/", RecommendRoomView.as_view(), name="recommend-room"),
    path("import-departments/", ImportDepartmentsView.as_view(), name="import-departments"),
    path("import-rooms/", ImportRoomsView.as_view(), name="import-rooms"),
    path("import-sections/", ImportSectionsView.as_view(), name="import-sections"),
    path("import-timetable-entries/", ImportTimetableEntriesView.as_view(), name="import-timetable-entries"),
    path("room-choices/", RoomChoicesView.as_view(), name="room-choices"),
    path("rooms-template/", RoomsTemplateView.as_view(), name="rooms-template"),
    path("dashboard/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("", include(router.urls)),
]
