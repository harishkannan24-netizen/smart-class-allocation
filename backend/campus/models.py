from django.core.exceptions import ValidationError
from django.db import models


class Campus(models.Model):
    name = models.CharField(max_length=150)
    address = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Block(models.Model):
    campus = models.ForeignKey(Campus, on_delete=models.CASCADE, related_name="blocks")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)

    class Meta:
        unique_together = ("campus", "name")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.campus.name})"


class Floor(models.Model):
    block = models.ForeignKey(Block, on_delete=models.CASCADE, related_name="floors")
    number = models.IntegerField(help_text="e.g. 0 for ground floor, 1, 2, 3...")
    name = models.CharField(max_length=100, blank=True, help_text="Optional display name, e.g. 'Ground Floor'")

    class Meta:
        unique_together = ("block", "number")
        ordering = ["block", "number"]

    def __str__(self):
        return f"{self.block.name} - Floor {self.number}"


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g. CSE, ECE, MECH")
    hod_name = models.CharField(max_length=150, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.code


class Room(models.Model):
    class RoomType(models.TextChoices):
        CLASSROOM = "CLASSROOM", "Classroom"
        LAB = "LAB", "Laboratory"
        SEMINAR_HALL = "SEMINAR_HALL", "Seminar Hall"
        LIBRARY = "LIBRARY", "Library"
        AUDITORIUM = "AUDITORIUM", "Auditorium"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        FREE = "FREE", "Free"
        ALLOCATED = "ALLOCATED", "Allocated"
        OCCUPIED = "OCCUPIED", "Occupied"
        RESERVED = "RESERVED", "Reserved"
        MAINTENANCE = "MAINTENANCE", "Maintenance"

    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name="rooms")
    room_number = models.CharField(max_length=30)
    room_type = models.CharField(max_length=20, choices=RoomType.choices, default=RoomType.CLASSROOM)
    capacity = models.PositiveIntegerField(default=60)
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="rooms", help_text="Department this room is permanently assigned to (if any).",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FREE)

    # Equipment
    has_projector = models.BooleanField(default=False)
    has_smart_board = models.BooleanField(default=False)
    is_computer_lab = models.BooleanField(default=False)
    has_ac = models.BooleanField(default=False)
    has_wifi = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("floor", "room_number")
        ordering = ["floor", "room_number"]

    def __str__(self):
        return self.room_number

    @property
    def block(self):
        return self.floor.block

    @property
    def campus(self):
        return self.floor.block.campus


class Section(models.Model):
    """A class/section, e.g. CSE - 2nd Year - Section A."""

    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="sections")
    year = models.PositiveSmallIntegerField(help_text="1, 2, 3, 4")
    name = models.CharField(max_length=10, help_text="e.g. A, B, C")
    semester = models.PositiveSmallIntegerField(default=1)
    strength = models.PositiveIntegerField(default=60)
    class_advisor = models.CharField(max_length=150, blank=True)
    permanent_room = models.ForeignKey(
        Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="permanent_sections"
    )

    class Meta:
        unique_together = ("department", "year", "name", "semester")
        ordering = ["department", "year", "name"]

    def __str__(self):
        return f"{self.department.code}-{self.year}{self.name}"


class TimetableEntry(models.Model):
    """A single scheduled slot: which section is where, doing what, at what time."""

    class Day(models.TextChoices):
        MONDAY = "MON", "Monday"
        TUESDAY = "TUE", "Tuesday"
        WEDNESDAY = "WED", "Wednesday"
        THURSDAY = "THU", "Thursday"
        FRIDAY = "FRI", "Friday"
        SATURDAY = "SAT", "Saturday"
        SUNDAY = "SUN", "Sunday"

    class ActivityType(models.TextChoices):
        LECTURE = "LECTURE", "Lecture"
        LAB = "LAB", "Laboratory"
        LIBRARY = "LIBRARY", "Library"
        SEMINAR = "SEMINAR", "Seminar"
        WORKSHOP = "WORKSHOP", "Workshop"
        SPORTS = "SPORTS", "Sports"
        INTERNSHIP = "INTERNSHIP", "Internship"
        EXAM = "EXAM", "Exam"
        HOLIDAY = "HOLIDAY", "Holiday"

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="timetable_entries")
    room = models.ForeignKey(
        Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="timetable_entries",
        help_text="Room used for this slot. Leave blank if activity is off-site (e.g. sports, internship).",
    )
    subject = models.CharField(max_length=150, blank=True)
    faculty_name = models.CharField(max_length=150, blank=True)
    activity_type = models.CharField(max_length=20, choices=ActivityType.choices, default=ActivityType.LECTURE)
    day = models.CharField(max_length=3, choices=Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["day", "start_time"]
        verbose_name_plural = "Timetable entries"

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError("start_time must be before end_time.")

    def __str__(self):
        return f"{self.section} - {self.day} {self.start_time}-{self.end_time}"

    @property
    def frees_up_room(self):
        """True if this activity moves the section out of its room (making the room available)."""
        return self.activity_type in {
            self.ActivityType.LAB, self.ActivityType.LIBRARY, self.ActivityType.SEMINAR,
            self.ActivityType.WORKSHOP, self.ActivityType.SPORTS, self.ActivityType.INTERNSHIP,
        } or self.room is None


class TemporaryAllocation(models.Model):
    """A department temporarily borrowing a room that is free during a specific window."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="temporary_allocations")
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="temporary_allocations")
    day = models.CharField(max_length=3, choices=TimetableEntry.Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="allocation_requests"
    )
    approved_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="allocations_approved"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.section} -> {self.room} ({self.day} {self.start_time}-{self.end_time})"
