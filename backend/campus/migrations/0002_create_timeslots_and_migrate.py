from django.db import migrations, models


def create_default_timeslots(apps, schema_editor):
    Timeslot = apps.get_model('campus', 'Timeslot')
    TimetableEntry = apps.get_model('campus', 'TimetableEntry')
    # default timeslots — user said timing optional; these are reasonable defaults
    defaults = [
        ('TS1', '09:00', '09:45'),
        ('TS2', '09:45', '10:30'),
        ('TS3', '10:30', '11:15'),
        ('TS4', '11:15', '12:00'),
        ('TS5', '13:00', '13:45'),
        ('TS6', '13:45', '14:30'),
        ('TS7', '14:30', '15:15'),
    ]
    created = []
    for i, (label, start, end) in enumerate(defaults, start=1):
        t = Timeslot.objects.create(label=label, start_time=start, end_time=end, order=i)
        created.append(t)

    # Map existing timetable entries to the first timeslot that contains their start_time
    for entry in TimetableEntry.objects.all():
        if entry.start_time:
            for t in created:
                if t.start_time <= entry.start_time and entry.start_time < t.end_time:
                    entry.timeslot_id = t.id
                    entry.save(update_fields=['timeslot'])
                    break


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_timeslots),
    ]
