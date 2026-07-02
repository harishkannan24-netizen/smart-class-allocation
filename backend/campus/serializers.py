from rest_framework import serializers

from .models import (
    Block, Campus, Department, Floor, Room, Section,
    TemporaryAllocation, TimetableEntry,
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
    label = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            "id", "department", "department_code", "year", "name", "semester",
            "strength", "class_advisor", "permanent_room", "permanent_room_number", "label",
        ]

    def get_label(self, obj):
        return str(obj)


class TimetableEntrySerializer(serializers.ModelSerializer):
    section_label = serializers.CharField(source="section.__str__", read_only=True)
    room_number = serializers.CharField(source="room.room_number", read_only=True, default=None)

    class Meta:
        model = TimetableEntry
        fields = [
            "id", "section", "section_label", "room", "room_number", "subject",
            "faculty_name", "activity_type", "day", "start_time", "end_time",
        ]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and start >= end:
            raise serializers.ValidationError("start_time must be before end_time.")

        # Conflict detection: same room, same day, overlapping time
        room = attrs.get("room", getattr(self.instance, "room", None))
        day = attrs.get("day", getattr(self.instance, "day", None))
        if room and day and start and end:
            qs = TimetableEntry.objects.filter(room=room, day=day, start_time__lt=end, end_time__gt=start)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    f"Room conflict: {room} is already booked on {day} during this time window."
                )
        return attrs


class TemporaryAllocationSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source="room.room_number", read_only=True)
    room_block_name = serializers.CharField(source="room.floor.block.name", read_only=True)
    section_label = serializers.CharField(source="section.__str__", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.username", read_only=True)

    class Meta:
        model = TemporaryAllocation
        fields = [
            "id", "room", "room_number", "room_block_name", "section", "section_label", "day",
            "start_time", "end_time", "reason", "status",
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
