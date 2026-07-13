from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('campus', '0005_remove_timeslot_from_timetableentry'),
    ]

    operations = [
        migrations.CreateModel(
            name='TimetableTemplate',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Default Template', max_length=150)),
                ('days', models.JSONField(default=list)),
                ('timeslots', models.JSONField(default=list)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
    ]
