from io import StringIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from .importers import import_timetable_entries
from .models import Block, Campus, Department, Floor, Room, Section, Timeslot, TimetableEntry
from .serializers import TimetableEntrySerializer


class SectionRoomSynchronizationTests(TestCase):
    def setUp(self):
        self.campus = Campus.objects.create(name="Test Campus")
        self.block = Block.objects.create(campus=self.campus, name="Block A")
        self.floor = Floor.objects.create(block=self.block, number=1, name="Ground Floor")
        self.department = Department.objects.create(name="Computer Science", code="CSE", hod_name="Dr. Test")
        self.room_one = Room.objects.create(floor=self.floor, room_number="LHA101", capacity=60)
        self.room_two = Room.objects.create(floor=self.floor, room_number="LHA102", capacity=60)
        self.section = Section.objects.create(
            department=self.department,
            year=2,
            name="A",
            semester=1,
            strength=60,
            permanent_room=self.room_one,
        )
        self.timeslot = Timeslot.objects.create(
            label="09:00-09:45",
            start_time="09:00:00",
            end_time="09:45:00",
            order=1,
            active=True,
        )

    def test_changing_section_room_updates_existing_timetable_entries(self):
        entry = TimetableEntry.objects.create(
            section=self.section,
            room=self.room_one,
            subject="Algorithms",
            faculty_name="Dr. Smith",
            day="MON",
            timeslot=self.timeslot,
        )

        self.section.permanent_room = self.room_two
        self.section.save()
        entry.refresh_from_db()

        self.assertEqual(entry.room, self.room_two)

    def test_timetable_serializer_uses_section_room_as_source_of_truth(self):
        stale_room = Room.objects.create(floor=self.floor, room_number="LHA999", capacity=60)
        entry = TimetableEntry.objects.create(
            section=self.section,
            room=stale_room,
            subject="Algorithms",
            faculty_name="Dr. Smith",
            day="MON",
            timeslot=self.timeslot,
        )

        data = TimetableEntrySerializer(entry).data

        self.assertEqual(data["room_number"], self.room_one.room_number)

    def test_import_timetable_entries_accepts_flexible_headers_in_preview_mode(self):
        csv_content = "Section Name,Faculty,Course Name,Day,Start Time,End Time,Activity\nA,Dr. Smith,Algorithms,Monday,09:00,10:00,Lecture\n"
        uploaded_file = SimpleUploadedFile("timetable.csv", csv_content.encode("utf-8"), content_type="text/csv")

        preview = import_timetable_entries(uploaded_file, preview_mode=True)

        self.assertEqual(preview["import_type"], "timetable")
        self.assertEqual(preview["valid_rows"], 1)
        self.assertEqual(preview["valid_data"][0]["data"]["section"], str(self.section))
        self.assertEqual(preview["valid_data"][0]["data"]["subject"], "Algorithms")

    def test_import_timetable_entries_accepts_grid_style_timetable_preview(self):
        csv_content = (
            "Section,CSE-2A\n"
            "Room No,R101\n"
            "Timings,09:00-10:00\n"
            "MON,CS101 Dr. Smith\n"
        )
        uploaded_file = SimpleUploadedFile("timetable_grid.csv", csv_content.encode("utf-8"), content_type="text/csv")

        preview = import_timetable_entries(uploaded_file, preview_mode=True)

        self.assertEqual(preview["import_type"], "timetable")
        self.assertEqual(preview["valid_rows"], 1)
        self.assertEqual(preview["valid_data"][0]["data"]["section"], str(self.section))
        self.assertEqual(preview["valid_data"][0]["data"]["subject"], "CS101 Dr. Smith")

    def test_import_timetable_grid_parses_department_and_semester(self):
        csv_content = (
            "CLASS TIME TABLE - V SEMESTER - ACADEMIC YEAR 2026 - 27\n"
            "DEPARTMENT OF IT\n"
            "SECTION,IT-A\n"
            "ROOM NO,LHA305\n"
            "DAYS,TIMINGS,08:45 a.m. - 09:45 a.m.,09:45 a.m. - 10:45 a.m.,BREAK,11:00 a.m. - 12:00 p.m.,12:00 p.m. to 01:00 p.m.\n"
            "MON,AIDS,DMT Lab,DCCN (L),,WCT (L)\n"
        )
        uploaded_file = SimpleUploadedFile("timetable_grid2.csv", csv_content.encode("utf-8"), content_type="text/csv")

        preview = import_timetable_entries(uploaded_file, preview_mode=True)

        self.assertEqual(preview["import_type"], "timetable")
        self.assertGreater(preview["valid_rows"], 0)
        first = preview["valid_data"][0]["data"]
        self.assertEqual(first.get("section"), "IT-A")
        self.assertEqual(first.get("department"), "AIDS")

    def test_import_timetable_grid_persists_timeslots_and_entries(self):
        csv_content = (
            "DEPARTMENT OF CSE\n"
            "SECTION,CSE-A\n"
            "ROOM NO,R101\n"
            "DAYS,TIMINGS,09:00-10:00,10:00-11:00\n"
            "MON,CS101 Dr. Alpha,CS102 Dr. Beta\n"
            "TUE,CS103 Dr. Gamma,\n"
        )
        uploaded_file = SimpleUploadedFile("timetable_grid_persist.csv", csv_content.encode("utf-8"), content_type="text/csv")

        before_ts = Timeslot.objects.count()
        before_entries = TimetableEntry.objects.count()

        result = import_timetable_entries(uploaded_file, preview_mode=False)

        # expect at least 2 entries created and timeslots for header ranges
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get('skipped'), 0)
        self.assertGreaterEqual(result.get('imported', 0), 2)

        after_ts = Timeslot.objects.count()
        after_entries = TimetableEntry.objects.count()

        self.assertGreater(after_ts, before_ts)
        self.assertGreaterEqual(after_entries, before_entries + 2)
