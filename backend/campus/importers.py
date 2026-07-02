import pandas as pd
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Block, Department, Floor, Room, Section, TimetableEntry
from .serializers import DepartmentSerializer, RoomSerializer, SectionSerializer, TimetableEntrySerializer


def _parse_file(uploaded_file):
    name = uploaded_file.name.lower()
    if name.endswith(".csv"):
        return pd.read_csv(uploaded_file)
    if name.endswith(('.xlsx', '.xls')):
        return pd.read_excel(uploaded_file, engine='openpyxl')
    raise ValidationError("Unsupported file type. Upload a .csv, .xls, or .xlsx file.")


def _normalize_columns(df):
    df = df.rename(columns={col: str(col).strip() for col in df.columns})
    df.columns = [str(col).strip() for col in df.columns]
    return df


def _normalize_text(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _normalize_bool(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    text = str(value).strip().lower()
    return text in {"true", "1", "yes", "y", "on"}


def _resolve_instance(raw_value, model, lookup_fields):
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        return None
    value = str(raw_value).strip()
    if not value:
        return None

    if value.isdigit():
        try:
            return model.objects.get(pk=int(value))
        except model.DoesNotExist:
            pass

    filters = [{field: value} for field in lookup_fields]
    for filter_kwargs in filters:
        obj = model.objects.filter(**filter_kwargs).first()
        if obj:
            return obj

    for obj in model.objects.all():
        if str(obj).strip().lower() == value.lower():
            return obj

    raise ValidationError(f"Could not resolve {model.__name__} for '{value}'.")


def _resolve_floor(raw_value, block=None):
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        return None
    value = str(raw_value).strip()
    if not value:
        return None

    if block is not None:
        if value.isdigit():
            floor = Floor.objects.filter(block=block, number=int(value)).first()
            if floor:
                return floor
            floor = Floor.objects.filter(block=block, pk=int(value)).first()
            if floor:
                return floor
        floor = Floor.objects.filter(block=block, name__iexact=value).first()
        if floor:
            return floor
        raise ValidationError(f"Could not resolve Floor for '{value}' within block '{block.name}'.")

    if value.isdigit():
        floor = Floor.objects.filter(pk=int(value)).first()
        if floor:
            return floor
        matches = Floor.objects.filter(number=int(value))
        if matches.count() == 1:
            return matches.first()
        if matches.count() > 1:
            raise ValidationError(
                f"Floor number '{value}' is ambiguous. Please provide a block value to disambiguate."
            )

    floor = Floor.objects.filter(name__iexact=value).first()
    if floor:
        return floor

    raise ValidationError(
        f"Could not resolve Floor for '{value}'. Provide a floor id, floor name, or floor number with block."
    )


def _normalize_time(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    return str(value).strip()


def _normalize_choice(value, choices):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    if not text:
        return None
    text_upper = text.upper()
    for choice, label in choices:
        if text_upper == str(choice).upper() or text_upper == str(label).upper():
            return choice
    raise ValidationError(f"Invalid value '{text}' for choices: {', '.join([choice for choice, _ in choices])}.")


def _validate_headers(df, required_columns):
    missing = [column for column in required_columns if column not in df.columns]
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")


def import_departments(uploaded_file):
    df = _normalize_columns(_parse_file(uploaded_file))
    _validate_headers(df, ['name', 'code'])

    errors = []
    created_count = 0

    with transaction.atomic():
        for row_index, row in df.iterrows():
            payload = {
                'name': _normalize_text(row.get('name')),
                'code': _normalize_text(row.get('code')),
                'hod_name': _normalize_text(row.get('hod_name')),
            }
            serializer = DepartmentSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({
                    'row': int(row_index) + 2,
                    'errors': serializer.errors,
                })

        if errors:
            raise ValidationError(errors)

    return created_count


def import_rooms(uploaded_file):
    df = _normalize_columns(_parse_file(uploaded_file))
    _validate_headers(df, ['floor', 'room_number'])

    errors = []
    created_count = 0

    with transaction.atomic():
        for row_index, row in df.iterrows():
            block = None
            if 'block' in df.columns and str(row.get('block')).strip():
                try:
                    block = _resolve_instance(row.get('block'), Block, ['id', 'code', 'name'])
                except ValidationError as exc:
                    errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                    continue

            floor_raw = row.get('floor')
            if floor_raw is None or str(floor_raw).strip() == '':
                errors.append({'row': int(row_index) + 2, 'errors': 'floor is required'})
                continue

            try:
                floor = _resolve_floor(floor_raw, block=block)
            except ValidationError as exc:
                errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                continue

            if floor is None:
                errors.append({'row': int(row_index) + 2, 'errors': 'floor could not be resolved'})
                continue

            department = None
            if 'department' in df.columns and str(row.get('department')).strip():
                try:
                    department = _resolve_instance(row.get('department'), Department, ['id', 'code', 'name'])
                except ValidationError as exc:
                    errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                    continue

            payload = {
                'floor': floor.id,
                'room_number': _normalize_text(row.get('room_number')),
                'room_type': _normalize_choice(row.get('room_type'), Room.RoomType.choices) or Room.RoomType.CLASSROOM,
                'capacity': int(_normalize_text(row.get('capacity')) or 60),
                'department': department.id if department else None,
                'status': _normalize_choice(row.get('status'), Room.Status.choices) or Room.Status.FREE,
                'has_projector': _normalize_bool(row.get('has_projector')),
                'has_smart_board': _normalize_bool(row.get('has_smart_board')),
                'is_computer_lab': _normalize_bool(row.get('is_computer_lab')),
                'has_ac': _normalize_bool(row.get('has_ac')),
                'has_wifi': _normalize_bool(row.get('has_wifi')),
            }
            serializer = RoomSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': int(row_index) + 2, 'errors': serializer.errors})

        if errors:
            raise ValidationError(errors)

    return created_count


def import_sections(uploaded_file):
    df = _normalize_columns(_parse_file(uploaded_file))
    _validate_headers(df, ['department', 'year', 'name'])

    errors = []
    created_count = 0

    with transaction.atomic():
        for row_index, row in df.iterrows():
            try:
                department = _resolve_instance(row.get('department'), Department, ['id', 'code', 'name'])
            except ValidationError as exc:
                errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                continue

            permanent_room = None
            if 'permanent_room' in df.columns and str(row.get('permanent_room')).strip():
                try:
                    permanent_room = _resolve_instance(row.get('permanent_room'), Room, ['id', 'room_number'])
                except ValidationError as exc:
                    errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                    continue

            payload = {
                'department': department.id,
                'year': int(_normalize_text(row.get('year')) or 1),
                'name': _normalize_text(row.get('name')),
                'semester': int(_normalize_text(row.get('semester')) or 1),
                'strength': int(_normalize_text(row.get('strength')) or 60),
                'class_advisor': _normalize_text(row.get('class_advisor')),
                'permanent_room': permanent_room.id if permanent_room else None,
            }
            serializer = SectionSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': int(row_index) + 2, 'errors': serializer.errors})

        if errors:
            raise ValidationError(errors)

    return created_count


def import_timetable_entries(uploaded_file):
    df = _normalize_columns(_parse_file(uploaded_file))
    _validate_headers(df, ['section', 'day', 'start_time', 'end_time'])

    errors = []
    created_count = 0

    with transaction.atomic():
        for row_index, row in df.iterrows():
            try:
                section = _resolve_instance(row.get('section'), Section, ['id', 'name'])
            except ValidationError as exc:
                errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                continue

            room = None
            if 'room' in df.columns and str(row.get('room')).strip():
                try:
                    room = _resolve_instance(row.get('room'), Room, ['id', 'room_number'])
                except ValidationError as exc:
                    errors.append({'row': int(row_index) + 2, 'errors': str(exc)})
                    continue

            payload = {
                'section': section.id,
                'room': room.id if room else None,
                'subject': _normalize_text(row.get('subject')),
                'faculty_name': _normalize_text(row.get('faculty_name')),
                'activity_type': _normalize_choice(row.get('activity_type'), TimetableEntry.ActivityType.choices) or TimetableEntry.ActivityType.LECTURE,
                'day': _normalize_choice(row.get('day'), TimetableEntry.Day.choices),
                'start_time': _normalize_time(row.get('start_time')),
                'end_time': _normalize_time(row.get('end_time')),
            }
            serializer = TimetableEntrySerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': int(row_index) + 2, 'errors': serializer.errors})

        if errors:
            raise ValidationError(errors)

    return created_count
