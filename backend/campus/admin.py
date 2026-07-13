from django.contrib import admin

from django.contrib import admin

from .models import (
    Block, Campus, Department, Floor, Room, Section,
    TemporaryAllocation, TimetableEntry, Timeslot,
)


@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ["name", "address"]
    search_fields = ["name", "address"]


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ["name", "campus", "code"]
    search_fields = ["name", "code"]
    list_filter = ["campus"]


@admin.register(Floor)
class FloorAdmin(admin.ModelAdmin):
    list_display = ["block", "number", "name"]
    list_filter = ["block__campus", "block"]
    search_fields = ["name"]


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "hod_name"]
    search_fields = ["code", "name", "hod_name"]


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ["room_number", "floor", "room_type", "capacity", "status", "department"]
    list_filter = ["room_type", "status", "floor__block", "floor"]
    search_fields = ["room_number"]


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    def section_label(self, obj):
        return str(obj)
    section_label.short_description = "Section"

    list_display = ["section_label", "department", "year", "semester", "permanent_room"]
    list_filter = ["department", "year", "semester"]
    search_fields = ["name", "department__code", "class_advisor"]


@admin.register(Timeslot)
class TimeslotAdmin(admin.ModelAdmin):
    list_display = ["label", "start_time", "end_time", "order", "active"]
    list_editable = ["order", "active"]
    ordering = ["order", "start_time"]


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = ["section", "day", "timeslot", "room", "faculty_name", "activity_type"]
    list_filter = ["day", "activity_type", "timeslot"]
    search_fields = ["section__name", "faculty_name", "subject"]


@admin.register(TemporaryAllocation)
class TemporaryAllocationAdmin(admin.ModelAdmin):
    list_display = ["section", "room", "day", "start_time", "end_time", "status"]
    list_filter = ["status", "day", "room", "section"]
    search_fields = ["section__name", "room__room_number", "requested_by__username"]
