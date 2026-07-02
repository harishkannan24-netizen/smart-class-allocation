"""
Smart Free Room Detection Engine.

Given a day + time window, determines which rooms are free by cross-referencing:
  - the room's permanent section (if any) and whether that section's timetable
    entry for this slot keeps them in the room or frees it up (lab/library/etc.)
  - any approved temporary allocations already occupying the room
  - room status (maintenance rooms are never "free")
"""
from django.db.models import Q

from .models import Room, TemporaryAllocation, TimetableEntry


def _times_overlap(start1, end1, start2, end2):
    return start1 < end2 and start2 < end1


def get_room_status_for_slot(room: Room, day: str, start_time, end_time):
    """
    Returns a dict describing whether `room` is free for the given day/time window,
    and why (occupying section, activity, or temporary allocation).
    """
    if room.status == Room.Status.MAINTENANCE:
        return {"room": room, "available": False, "reason": "MAINTENANCE"}

    # 1. Check approved temporary allocations first (highest priority override)
    temp = TemporaryAllocation.objects.filter(
        room=room, day=day, status=TemporaryAllocation.Status.APPROVED
    ).filter(
        Q(start_time__lt=end_time) & Q(end_time__gt=start_time)
    ).select_related("section").first()
    if temp:
        return {
            "room": room, "available": False, "reason": "TEMPORARY_ALLOCATION",
            "occupying_section": temp.section, "start_time": temp.start_time, "end_time": temp.end_time,
        }

    # 2. Check regular timetable entries scheduled in this room for this slot
    entries = TimetableEntry.objects.filter(
        room=room, day=day
    ).filter(
        Q(start_time__lt=end_time) & Q(end_time__gt=start_time)
    ).select_related("section")

    for entry in entries:
        if not entry.frees_up_room:
            return {
                "room": room, "available": False, "reason": "SCHEDULED_CLASS",
                "occupying_section": entry.section, "activity_type": entry.activity_type,
                "subject": entry.subject, "faculty_name": entry.faculty_name,
                "start_time": entry.start_time, "end_time": entry.end_time,
            }
        # else: section is at a lab/library/etc — room is empty during this entry's window

    return {"room": room, "available": True, "reason": None}


def find_free_rooms(day: str, start_time, end_time, campus_id=None, block_id=None, floor_id=None,
                     room_type=None, min_capacity=None, department_id=None):
    """Returns a queryset-derived list of Room objects free for the given window, with optional filters."""
    qs = Room.objects.select_related("floor__block__campus", "department").exclude(status=Room.Status.MAINTENANCE)

    if campus_id:
        qs = qs.filter(floor__block__campus_id=campus_id)
    if block_id:
        qs = qs.filter(floor__block_id=block_id)
    if floor_id:
        qs = qs.filter(floor_id=floor_id)
    if room_type:
        qs = qs.filter(room_type=room_type)
    if min_capacity:
        qs = qs.filter(capacity__gte=min_capacity)
    if department_id:
        qs = qs.filter(department_id=department_id)

    free_rooms = []
    for room in qs:
        result = get_room_status_for_slot(room, day, start_time, end_time)
        if result["available"]:
            free_rooms.append(room)
    return free_rooms


def recommend_best_room(day, start_time, end_time, required_capacity=None, preferred_department_id=None,
                         preferred_block_id=None, room_type=None):
    """
    Recommends the single best free room for a temporary allocation request.
    Scoring prioritizes: matching department > matching block > closest capacity fit.
    """
    candidates = find_free_rooms(
        day=day, start_time=start_time, end_time=end_time,
        room_type=room_type, min_capacity=required_capacity,
    )
    if not candidates:
        return None

    def score(room):
        s = 0
        if preferred_department_id and room.department_id == preferred_department_id:
            s += 100
        if preferred_block_id and room.floor.block_id == preferred_block_id:
            s += 50
        if required_capacity:
            # smaller surplus capacity is better (less wasted space)
            surplus = room.capacity - required_capacity
            s -= surplus * 0.1
        return s

    return sorted(candidates, key=score, reverse=True)[0]
