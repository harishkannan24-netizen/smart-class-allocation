from django.db.models import Q
from rest_framework import serializers

from .models import (
    Block, Campus, Department, Floor, Room, Section,
    TemporaryAllocation, TimetableEntry, Timeslot,
)


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ["id", "name", "address", "created_at"]


class BlockSerializer(serializers.ModelSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = Block
        fields = ["id", "campus", "campus_name", "name", "code"]


class FloorSerializer(serializers.ModelSerializer):
    block_name = serializers.CharField(source="block.name", read_only=True)

    class Meta:
        model = Floor
        fields = ["id", "block", "block_name", "number", "name"]


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ["id", "name", "code", "hod_name", "created_at"]


class RoomSerializer(serializers.ModelSerializer):
    block = serializers.IntegerField(source="floor.block.id", read_only=True)
    block_name = serializers.CharField(source="floor.block.name", read_only=True)
    floor_number = serializers.IntegerField(source="floor.number", read_only=True)
    department_code = serializers.CharField(source="department.code", read_only=True)

    class Meta:
        model = Room
        fields = [
            "id", "floor", "block", "block_name", "floor_number", "room_number", "room_type",
            "capacity", "department", "department_code", "status",
            "has_projector", "has_smart_board", "is_computer_lab", "has_ac", "has_wifi",
            "created_at", "updated_at",
        ]


class SectionSerializer(serializers.ModelSerializer):
    department_code = serializers.CharField(source="department.code", read_only=True)
    permanent_room_number = serializers.CharField(source="permanent_room.room_number", read_only=True)
    permanent_room_block_name = serializers.CharField(source="permanent_room.floor.block.name", read_only=True)
    permanent_room_floor_number = serializers.IntegerField(source="permanent_room.floor.number", read_only=True)
    permanent_room_floor_name = serializers.CharField(source="permanent_room.floor.name", read_only=True)
    label = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id", "department", "department_code", "year", "name", "semester",
            "strength", "class_advisor", "permanent_room", "permanent_room_number",
            "permanent_room_block_name", "permanent_room_floor_number", "permanent_room_floor_name", "label",
        ]

    def get_label(self, obj):
        return str(obj)


class TimeslotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Timeslot
        fields = ["id", "label", "start_time", "end_time", "order", "active"]


class TimetableEntrySerializer(serializers.ModelSerializer):
    section_label = serializers.SerializerMethodField(read_only=True)
    room = serializers.SerializerMethodField(read_only=True)
    room_number = serializers.SerializerMethodField(read_only=True)
    room_block_name = serializers.SerializerMethodField(read_only=True)
    room_floor_number = serializers.SerializerMethodField(read_only=True)
    timeslot_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TimetableEntry
        fields = [
            "id", "section", "section_label", "room", "room_number", "room_block_name", "room_floor_number", "subject",
            "faculty_name", "activity_type", "day", "timeslot_label", "start_time", "end_time",
        ]
        read_only_fields = ["room"]

    def _get_effective_room(self, obj):
        if obj.section_id and obj.section and obj.section.permanent_room:
            return obj.section.permanent_room
        return obj.room

    def get_room(self, obj):
        room = self._get_effective_room(obj)
        return room.id if room else None

    def get_room_number(self, obj):
        room = self._get_effective_room(obj)
        return room.room_number if room else None

    def get_room_block_name(self, obj):
        room = self._get_effective_room(obj)
        return room.floor.block.name if room and room.floor and room.floor.block else None

    def get_room_floor_number(self, obj):
        room = self._get_effective_room(obj)
        return room.floor.number if room and room.floor else None

    def validate(self, attrs):
        section = attrs.get("section", getattr(self.instance, "section", None))
        # timeslot FK removed; rely on start_time/end_time
        day = attrs.get("day", getattr(self.instance, "day", None))
        faculty_name = attrs.get("faculty_name", getattr(self.instance, "faculty_name", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if not section:
            raise serializers.ValidationError({"section": "Section is required."})
        if not day:
            raise serializers.ValidationError({"day": "Day is required."})

        if not start_time or not end_time:
            raise serializers.ValidationError({"start_time": "Both start_time and end_time are required."})

        attrs["room"] = section.permanent_room

        start = attrs["start_time"]
        end = attrs["end_time"]
        if start >= end:
            raise serializers.ValidationError("start_time must be before end_time.")

        effective_room = attrs["room"]
        conflict_query = Q(day=day, start_time__lt=end, end_time__gt=start)
        if self.instance:
            conflict_query &= ~Q(pk=self.instance.pk)

        if effective_room and TimetableEntry.objects.filter(conflict_query, room=effective_room).exists():
            raise serializers.ValidationError(
                {"room": f"Room conflict: {effective_room} is already booked on {day} during this time."}
            )

        if faculty_name and TimetableEntry.objects.filter(conflict_query, faculty_name__iexact=faculty_name).exists():
            raise serializers.ValidationError(
                {"faculty_name": f"Faculty conflict: {faculty_name} is already teaching another class on {day} during this time."}
            )

        if section and TimetableEntry.objects.filter(conflict_query, section=section).exists():
            raise serializers.ValidationError(
                {"section": f"Section conflict: {section} already has a class scheduled on {day} during this time."}
            )

        return attrs

    def get_timeslot_label(self, obj):
        # keep displaying label if timeslot relation exists on older records
        ts = getattr(obj, 'timeslot', None)
        return ts.label if ts else None

    def get_section_label(self, obj):
        return str(obj.section)


class TemporaryAllocationSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.room_number", read_only=True)
    room_block_name = serializers.CharField(source="room.floor.block.name", read_only=True)
    section_label = serializers.CharField(source="section.__str__", read_only=True)
    section_year = serializers.IntegerField(source="section.year", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.username", read_only=True)

    class Meta:
        model = TemporaryAllocation
        fields = [
            "id", "room", "room_number", "room_block_name", "section", "section_label",
            "section_year", "day", "start_time", "end_time", "reason", "status",
            "requested_by", "requested_by_name", "approved_by", "created_at",
        ]
        read_only_fields = ["requested_by", "approved_by", "created_at"]


class FreeRoomQuerySerializer(serializers.Serializer):
    day = serializers.ChoiceField(choices=TimetableEntry.Day.choices)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    campus_id = serializers.IntegerField(required=False)
    block_id = serializers.IntegerField(required=False)
    floor_id = serializers.IntegerField(required=False)
    room_type = serializers.ChoiceField(choices=Room.RoomType.choices, required=False)
    min_capacity = serializers.IntegerField(required=False)
    department_id = serializers.IntegerField(required=False)
