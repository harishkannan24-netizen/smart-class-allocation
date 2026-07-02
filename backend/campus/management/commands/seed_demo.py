from datetime import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from campus.models import Block, Campus, Department, Floor, Room, Section, TimetableEntry

User = get_user_model()


class Command(BaseCommand):
    help = "Seeds demo data: campus, blocks, floors, rooms, departments, sections, timetable, and demo users."

    def handle(self, *args, **options):
        # --- Users ---
        if not User.objects.filter(username="iqac").exists():
            User.objects.create_superuser(
                username="iqac", email="iqac@campus.edu", password="Iqac@2024",
                role=User.Role.SUPER_ADMIN, first_name="Super", last_name="Admin",
            )
            self.stdout.write(self.style.SUCCESS("Created super admin: iqac / Iqac@2024"))

        # --- Campus structure ---
        campus, _ = Campus.objects.get_or_create(name="Main Campus")
        block_a, _ = Block.objects.get_or_create(campus=campus, name="Block A", code="A")
        floor2, _ = Floor.objects.get_or_create(block=block_a, number=2, name="Floor 2")

        cse, _ = Department.objects.get_or_create(name="Computer Science Engineering", code="CSE")
        Department.objects.get_or_create(name="Electronics & Communication", code="ECE")

        room_202, _ = Room.objects.get_or_create(
            floor=floor2, room_number="LHA202",
            defaults=dict(room_type=Room.RoomType.CLASSROOM, capacity=65, department=cse,
                          has_projector=True, has_wifi=True),
        )

        section_b, _ = Section.objects.get_or_create(
            department=cse, year=2, name="B", semester=3,
            defaults=dict(strength=63, class_advisor="Dr. Priya Sharma", permanent_room=room_202),
        )
        Section.objects.get_or_create(
            department=cse, year=2, name="A", semester=3,
            defaults=dict(strength=60, class_advisor="Dr. Ramesh Kumar"),
        )

        # Wednesday 10-12: CSE-B has a Lab -> LHA202 becomes free
        TimetableEntry.objects.get_or_create(
            section=section_b, room=room_202, day=TimetableEntry.Day.WEDNESDAY,
            start_time=time(10, 0), end_time=time(12, 0),
            defaults=dict(activity_type=TimetableEntry.ActivityType.LAB, subject="DBMS Lab",
                          faculty_name="Dr. Priya Sharma"),
        )
        # Wednesday 9-10: CSE-B is in its own room for a lecture
        TimetableEntry.objects.get_or_create(
            section=section_b, room=room_202, day=TimetableEntry.Day.WEDNESDAY,
            start_time=time(9, 0), end_time=time(10, 0),
            defaults=dict(activity_type=TimetableEntry.ActivityType.LECTURE, subject="Operating Systems",
                          faculty_name="Dr. Priya Sharma"),
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        self.stdout.write("Try: GET /api/campus/free-rooms/?day=WED&start_time=10:00&end_time=12:00")
