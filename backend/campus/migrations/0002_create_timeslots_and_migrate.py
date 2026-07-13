from django.db import migrations, models


def create_default_timeslots(apps, schema_editor):
    Timeslot = apps.get_model('campus', 'Timeslot')
    TimetableEntry = apps.get_model('campus', 'TimetableEntry')
    # default timeslots — user said timing optional; these are reasonable defaults
    defaults = [
        ('08:45 a.m. - 09:45 a.m.', '08:45:00', '09:45:00'),
        ('09:45 a.m. - 10:45 a.m.', '09:45:00', '10:45:00'),
        ('10:45 a.m. - 11:00 a.m. - BREAK', '10:45:00', '11:00:00'),
        ('11:00 a.m. - 12:00 p.m.', '11:00:00', '12:00:00'),
        ('12:00 p.m. - 01:00 p.m.', '12:00:00', '13:00:00'),
        ('01:00 p.m. - 02:00 p.m. - LUNCH', '13:00:00', '14:00:00'),
        ('02:00 p.m. - 03:00 p.m.', '14:00:00', '15:00:00'),
        ('03:00 p.m. - 03:50 p.m.', '15:00:00', '15:50:00'),
        ('03:50 p.m. - 04:40 p.m.', '15:50:00', '16:40:00'),
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
