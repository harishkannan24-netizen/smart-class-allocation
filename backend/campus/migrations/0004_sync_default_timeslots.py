from django.db import migrations


def sync_default_timeslots(apps, schema_editor):
    Timeslot = apps.get_model('campus', 'Timeslot')

    # Template columns based on provided timetable image
    defaults = [
        ('08:45 a.m. - 09:45 a.m.', '08:45:00', '09:45:00'),
        ('09:45 a.m. - 10:45 a.m.', '09:45:00', '10:45:00'),
        ('10:45 a.m. - 11:00 a.m.', '10:45:00', '11:00:00'),
        ('11:00 a.m. - 12:00 p.m.', '11:00:00', '12:00:00'),
        ('12:00 p.m. - 01:00 p.m.', '12:00:00', '13:00:00'),
        ('02:00 p.m. - 03:00 p.m.', '14:00:00', '15:00:00'),
        ('03:50 p.m. - 04:40 p.m.', '15:50:00', '16:40:00'),
    ]

    valid_ranges = {(start, end) for _, start, end in defaults}
    existing_timeslots = {
        (ts.start_time.isoformat(), ts.end_time.isoformat()): ts
        for ts in Timeslot.objects.all()
    }

    for index, (label, start_time, end_time) in enumerate(defaults, start=1):
        ts = existing_timeslots.get((start_time, end_time))
        if ts:
            ts.label = label
            ts.order = index
            ts.active = True
            ts.save(update_fields=['label', 'order', 'active'])
        else:
            Timeslot.objects.create(
                label=label,
                start_time=start_time,
                end_time=end_time,
                order=index,
                active=True,
            )

    for ts in Timeslot.objects.all():
        if (ts.start_time.isoformat(), ts.end_time.isoformat()) not in valid_ranges:
            if ts.active:
                ts.active = False
                ts.save(update_fields=['active'])


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0003_timeslot_active_alter_timeslot_id'),
    ]

    operations = [
        migrations.RunPython(sync_default_timeslots),
    ]
