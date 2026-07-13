from django.db import migrations
import json
from pathlib import Path


def seed_template(apps, schema_editor):
    TimetableTemplate = apps.get_model('campus', 'TimetableTemplate')
    # locate timetable_template.json in the app directory
    base = Path(__file__).resolve().parent.parent
    p = base / 'timetable_template.json'
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        data = {}

    days = data.get('days', [])
    timeslots = data.get('timeslots', [])

    # create only if no template exists
    if not TimetableTemplate.objects.exists():
        TimetableTemplate.objects.create(name='Default Template', days=days, timeslots=timeslots, active=True)


def unseed_template(apps, schema_editor):
    TimetableTemplate = apps.get_model('campus', 'TimetableTemplate')
    TimetableTemplate.objects.filter(name='Default Template').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0006_create_timetabletemplate'),
    ]

    operations = [
        migrations.RunPython(seed_template, unseed_template),
    ]
