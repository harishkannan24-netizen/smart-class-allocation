from django.contrib import admin

from .models import (
    Block, Campus, Department, Floor, Room, Section,
    TemporaryAllocation, TimetableEntry,
)

admin.site.register(Campus)
admin.site.register(Block)
admin.site.register(Floor)
admin.site.register(Department)
admin.site.register(Room)
admin.site.register(Section)
admin.site.register(TimetableEntry)
admin.site.register(TemporaryAllocation)
