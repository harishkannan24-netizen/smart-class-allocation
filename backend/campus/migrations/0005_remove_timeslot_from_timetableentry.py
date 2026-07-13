from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0004_sync_default_timeslots'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='timetableentry',
            name='timeslot',
        ),
    ]
