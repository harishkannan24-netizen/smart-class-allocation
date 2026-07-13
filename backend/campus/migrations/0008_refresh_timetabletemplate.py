from django.db import migrations
import json
from pathlib import Path


def refresh_timetable_template(apps, schema_editor):
    TimetableTemplate = apps.get_model('campus', 'TimetableTemplate')
    base = Path(__file__).resolve().parent.parent
    p = base / 'timetable_template.json'
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return

    days = data.get('days', [])
    timeslots = data.get('timeslots', [])

    template = TimetableTemplate.objects.filter(active=True).order_by('-updated_at').first()
    if template:
        template.days = days
        template.timeslots = timeslots
        template.save(update_fields=['days', 'timeslots', 'updated_at'])
    else:
        TimetableTemplate.objects.create(name='Default Template', days=days, timeslots=timeslots, active=True)


def revert_timetable_template(apps, schema_editor):
    # No automatic revert, leave template as-is on rollback.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0007_seed_timetabletemplate'),
    ]

    operations = [
        migrations.RunPython(refresh_timetable_template, revert_timetable_template),
    ]
