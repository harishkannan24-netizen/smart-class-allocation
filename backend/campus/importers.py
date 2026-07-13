import pandas as pd
from datetime import datetime
from django.core.exceptions import ValidationError
from django.db import transaction
from difflib import SequenceMatcher
from io import StringIO
import csv
import re

from .models import Block, Campus, Department, Floor, Room, Section, TimetableEntry, Timeslot
from .serializers import DepartmentSerializer, RoomSerializer, SectionSerializer, TimetableEntrySerializer


# ============================================================================
# COLUMN MAPPING AND INTELLIGENT DETECTION
# ============================================================================

def _normalize_column_name(col):
    """Normalize a column name for fuzzy matching: lowercase, remove special chars."""
    return str(col).strip().lower().replace('_', '').replace('-', '').replace(' ', '')


def _fuzzy_match(text, target, threshold=0.6):
    """Check if text fuzzy matches target with a similarity threshold."""
    ratio = SequenceMatcher(None, text, target).ratio()
    return ratio >= threshold


def _map_column(col_name, valid_fields):
    """
    Map a column name to a standard field name using fuzzy matching.
    
    valid_fields: dict mapping standard field names to lists of acceptable aliases
    Returns: (standard_field_name, confidence) or (None, 0)
    """
    normalized_col = _normalize_column_name(col_name)
    
    for standard_field, aliases in valid_fields.items():
        # Check exact match first (after normalization)
        for alias in aliases:
            if _normalize_column_name(alias) == normalized_col:
                return standard_field, 1.0
        
        # Check fuzzy match
        for alias in aliases:
            if _fuzzy_match(normalized_col, _normalize_column_name(alias), threshold=0.75):
                return standard_field, 0.9
    
    # No match found
    return None, 0


def _detect_import_type_and_map_columns(df):
    """
    Auto-detect the import type (departments, rooms, sections, timetable) from columns
    and return the mapped dataframe and import type.
    """
    df_norm = _normalize_columns(df)
    normalized_cols = {_normalize_column_name(col): col for col in df_norm.columns}
    
    # Define field mappings for each import type
    timetable_fields = {
        'section': ['section', 'section_name', 'class', 'class_name'],
        'day': ['day', 'weekday', 'week_day'],
        'start_time': ['start_time', 'starttime', 'time_from', 'from_time', 'start'],
        'end_time': ['end_time', 'endtime', 'time_to', 'to_time', 'end'],
        'subject': ['subject', 'course', 'course_name', 'course_code'],
        'faculty_name': ['faculty', 'faculty_name', 'staff', 'teacher', 'professor', 'instructor'],
        'activity_type': ['activity', 'activity_type', 'type', 'class_type'],
        'timeslot': ['timeslot', 'slot'],
    }
    
    rooms_fields = {
        'floor': ['floor', 'floor_name', 'floor_number'],
        'room_number': ['room', 'room_number', 'room_id', 'room_code'],
        'block': ['block', 'block_name', 'block_code'],
        'room_type': ['room_type', 'type', 'category'],
        'capacity': ['capacity', 'seats', 'strength', 'occupancy'],
        'department': ['department', 'dept', 'dept_name'],
        'has_projector': ['has_projector', 'projector'],
        'has_smart_board': ['has_smart_board', 'smart_board', 'smartboard'],
        'is_computer_lab': ['is_computer_lab', 'computer_lab', 'lab', 'computerlab'],
        'has_ac': ['has_ac', 'ac', 'air_conditioned'],
        'has_wifi': ['has_wifi', 'wifi'],
        'status': ['status'],
    }
    
    sections_fields = {
        'department': ['department', 'dept', 'dept_name'],
        'year': ['year', 'year_of_study', 'studying_year'],
        'name': ['name', 'section_name', 'class', 'class_name'],
        'semester': ['semester', 'sem'],
        'strength': ['strength', 'capacity', 'total_students'],
        'class_advisor': ['class_advisor', 'advisor', 'advisor_name', 'class_incharge'],
        'permanent_room': ['permanent_room', 'room', 'room_number'],
    }
    
    departments_fields = {
        'name': ['name', 'department_name', 'department'],
        'code': ['code', 'dept_code', 'code', 'short_name'],
        'hod_name': ['hod_name', 'hod', 'head_of_department', 'director'],
    }
    
    # Count which fields are present in the data
    def count_matching_fields(field_map):
        count = 0
        for field, aliases in field_map.items():
            for alias in aliases:
                if _normalize_column_name(alias) in normalized_cols:
                    count += 1
                    break
        return count
    
    timetable_score = count_matching_fields(timetable_fields)
    rooms_score = count_matching_fields(rooms_fields)
    sections_score = count_matching_fields(sections_fields)
    departments_score = count_matching_fields(departments_fields)
    
    # Determine import type
    scores = {
        'timetable': timetable_score,
        'rooms': rooms_score,
        'sections': sections_score,
        'departments': departments_score,
    }
    
    import_type = max(scores, key=scores.get)
    
    # Get the field map for this type
    field_map = {
        'timetable': timetable_fields,
        'rooms': rooms_fields,
        'sections': sections_fields,
        'departments': departments_fields,
    }[import_type]
    
    # Map columns
    column_mapping = {}  # original_col -> standard_field
    for original_col in df_norm.columns:
        standard_field, conf = _map_column(original_col, field_map)
        if standard_field:
            column_mapping[original_col] = standard_field
    
    return import_type, column_mapping, df_norm


def _apply_column_mapping(row, column_mapping):
    """Apply column mapping to a row, extracting values using mapped field names."""
    mapped_row = {}
    for original_col, standard_field in column_mapping.items():
        mapped_row[standard_field] = row.get(original_col)
    return mapped_row


def _normalize_header_text(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"[^A-Za-z0-9 ]+", " ", str(value)).strip().upper()


def _parse_time_token(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip().lower()
    text = text.replace("a.m.", "am").replace("p.m.", "pm").replace(". ", " ").replace(".", ":")
    # Direct range like 09:00-10:00, 11:00 am to 12:00 pm, 09:00 – 10:00
    range_match = re.search(r"(\d{1,2}(?::\d{2})?)\s*(?:[-–]|to)\s*(\d{1,2}(?::\d{2})?)", text)
    if range_match:
        start = _format_time_literal(range_match.group(1))
        end = _format_time_literal(range_match.group(2))
        if start and end:
            return [start, end]

    tokens = re.findall(r"(\d{1,2}(?::\d{2})?)\s*(am|pm)", text, flags=re.I)
    if len(tokens) >= 2:
        return [_format_time_literal(tokens[0][0], tokens[0][1]), _format_time_literal(tokens[1][0], tokens[1][1])]

    tokens = re.findall(r"(\d{1,2}(?::\d{2})?)", text)
    if len(tokens) >= 2:
        return [_format_time_literal(tokens[0]), _format_time_literal(tokens[1])]

    return None


def _format_time_literal(value, ampm=None):
    value = str(value).strip()
    if ":" in value:
        hour, minute = value.split(":", 1)
    elif "." in value:
        hour, minute = value.split(".", 1)
    else:
        hour, minute = value, "00"
    try:
        hour_i = int(hour)
        minute_i = int(minute)
    except ValueError:
        return None
    if ampm:
        ampm = ampm.lower()
        if ampm == "pm" and hour_i != 12:
            hour_i += 12
        if ampm == "am" and hour_i == 12:
            hour_i = 0
    if hour_i < 0 or hour_i > 23 or minute_i < 0 or minute_i > 59:
        return None
    return f"{hour_i:02d}:{minute_i:02d}"


def _roman_to_int(roman: str):
    if not roman:
        return None
    roman = str(roman).upper().strip()
    mapping = {'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8}
    return mapping.get(roman)


def _parse_semester_text(text):
    if text is None:
        return None
    t = str(text).upper()
    # only attempt parsing if text contains SEM or SEMESTER to avoid picking academic year
    if not re.search(r"\bSEM\b|\bSEMESTER\b", t):
        return None
    # prefer patterns adjacent to SEM or SEMESTER: 'V SEM', 'V SEMESTER', 'SEM V'
    m = re.search(r"\b([IVX]+)\b\s*(?:SEM|SEMESTER)", t)
    if m:
        return _roman_to_int(m.group(1))
    m2 = re.search(r"(?:SEM|SEMESTER)\s*[:\-]?\s*([IVX]+|\d+)", t)
    if m2:
        val = m2.group(1)
        try:
            if re.fullmatch(r"[IVX]+", val):
                return _roman_to_int(val)
            return int(val)
        except Exception:
            pass
    # fallback: try find standalone roman numeral
    m3 = re.search(r"\b(I|II|III|IV|V|VI|VII|VIII)\b", t)
    if m3:
        return _roman_to_int(m3.group(1))
    return None


def _normalize_subject_code(value):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"[^A-Za-z0-9]+", "", str(value)).upper()


def _parse_subject_metadata(df):
    header_row = None
    headers = None
    for idx, row in df.iterrows():
        normalized = [_normalize_header_text(cell) for cell in row.tolist()]
        if any("SUB CODE" in cell or cell == "SUBCODE" for cell in normalized) and any("SUBJECT" in cell for cell in normalized):
            headers = normalized
            header_row = idx
            break

    if header_row is None or headers is None:
        return {}

    positions = {
        'sub_code': next((i for i, cell in enumerate(headers) if "SUB CODE" in cell or cell == "SUBCODE"), None),
        'subject_name': next((i for i, cell in enumerate(headers) if "SUBJECT" in cell), None),
        'mnemonic': next((i for i, cell in enumerate(headers) if "MNEMONIC" in cell), None),
        'staff_name': next((i for i, cell in enumerate(headers) if "STAFF" in cell), None),
        'department': next((i for i, cell in enumerate(headers) if "DEPARTMENT" in cell), None),
    }
    if positions['sub_code'] is None or positions['subject_name'] is None:
        return {}

    metadata = {}
    for row_idx in range(header_row + 1, len(df)):
        row = df.iloc[row_idx]
        code = _normalize_text(row.iloc[positions['sub_code']])
        if not code:
            continue
        mnemonic = _normalize_subject_code(row.iloc[positions['mnemonic']]) if positions['mnemonic'] is not None else ""
        subject_name = _normalize_text(row.iloc[positions['subject_name']])
        staff_name = _normalize_text(row.iloc[positions['staff_name']]) if positions['staff_name'] is not None else ""
        department = _normalize_text(row.iloc[positions['department']]) if positions['department'] is not None else ""
        metadata[mnemonic or _normalize_subject_code(code)] = {
            'code': code,
            'mnemonic': mnemonic,
            'subject_name': subject_name,
            'staff_name': staff_name,
            'department': department,
        }

    return metadata


def _map_grid_activity_type(raw_text):
    raw_text = str(raw_text or "").upper()
    if "LAB" in raw_text or "(L)" in raw_text:
        return TimetableEntry.ActivityType.LAB
    if "SEM" in raw_text or "(S)" in raw_text or "SEMINAR" in raw_text:
        return TimetableEntry.ActivityType.SEMINAR
    if "EXAM" in raw_text:
        return TimetableEntry.ActivityType.EXAM
    if "SPORT" in raw_text:
        return TimetableEntry.ActivityType.SPORTS
    if "LIB" in raw_text:
        return TimetableEntry.ActivityType.LIBRARY
    if "WORKSHOP" in raw_text:
        return TimetableEntry.ActivityType.WORKSHOP
    return TimetableEntry.ActivityType.LECTURE


def _normalize_day_label(value):
    text = _normalize_header_text(value)
    mapping = {
        'MON': 'MON', 'MONDAY': 'MON',
        'TUE': 'TUE', 'TUESDAY': 'TUE',
        'WED': 'WED', 'WEDNESDAY': 'WED',
        'THU': 'THU', 'THURSDAY': 'THU',
        'FRI': 'FRI', 'FRIDAY': 'FRI',
        'SAT': 'SAT', 'SATURDAY': 'SAT',
        'SUN': 'SUN', 'SUNDAY': 'SUN',
    }
    return mapping.get(text, None)


def _parse_grid_timetable(df):
    df = df.fillna("")
    # Look for the timings header row
    timings_row = None
    timing_label_index = 0
    for idx, row in df.iterrows():
        cells = [ _normalize_header_text(cell) for cell in row.tolist() ]
        if any("TIMINGS" == cell or "TIME" == cell or "DAYS" == cell for cell in cells):
            if any(_parse_time_token(_normalize_text(cell)) for cell in row.tolist()):
                timings_row = idx
                if "TIMINGS" in cells:
                    timing_label_index = cells.index("TIMINGS")
                elif "DAYS" in cells:
                    timing_label_index = cells.index("DAYS")
                else:
                    timing_label_index = 0
                break

    if timings_row is None:
        return None

    header_row = df.iloc[timings_row]
    time_columns = [None] * len(header_row)
    time_column_defs = []
    for col_idx in range(len(header_row)):
        if col_idx <= timing_label_index:
            time_columns[col_idx] = None
            continue
        col_text = _normalize_text(header_row.iloc[col_idx])
        if not col_text:
            time_columns[col_idx] = None
            continue
        parsed = _parse_time_token(col_text)
        if parsed:
            time_columns[col_idx] = parsed
            time_column_defs.append({'index': col_idx, 'start': parsed[0], 'end': parsed[1], 'label': col_text})
        else:
            if re.search(r"BREAK|LUNCH|NO CLASS", col_text, flags=re.I):
                time_columns[col_idx] = None
            else:
                time_columns[col_idx] = None

    metadata = _parse_subject_metadata(df)
    section_name = None
    room_name = None
    department_name = None
    semester_value = None
    for idx in range(min(10, len(df))):
        row = df.iloc[idx].tolist()
        for col_idx, cell in enumerate(row):
            label = _normalize_header_text(cell)
            if "SECTION" in label and section_name is None:
                section_name = _normalize_text(row[col_idx + 1] if col_idx + 1 < len(row) else "")
            if "ROOM NO" in label and room_name is None:
                room_name = _normalize_text(row[col_idx + 1] if col_idx + 1 < len(row) else "")
            if ("DEPARTMENT" in label or "DEPARTMENT OF" in label) and department_name is None:
                # department might be in next cell or in same cell; prefer next cell if non-empty
                next_cell = row[col_idx + 1] if col_idx + 1 < len(row) else ""
                department_name = _normalize_text(next_cell) or _normalize_text(cell)
            # try extract semester from title rows like 'V SEM' or 'V SEMESTER' (avoid picking academic year)
            if semester_value is None and ("SEM" in label or "SEMESTER" in label):
                sem = _parse_semester_text(cell)
                if sem:
                    semester_value = sem

    rows = []
    for idx in range(timings_row + 1, len(df)):
        row = df.iloc[idx]
        day_code = _normalize_day_label(row.iloc[0])
        if not day_code:
            continue
        # detect per-row department/section values in the pre-time columns
        row_department = None
        row_section = None
        for pre_col in range(1, min(len(row), timing_label_index + 1)):
            cell_val = _normalize_text(row.iloc[pre_col])
            if cell_val:
                if re.search(r"\d|\-", cell_val) and len(cell_val) <= 40:
                    row_section = cell_val
                    break
                if row_department is None:
                    row_department = cell_val

        # prepare cell texts for time columns and forward-fill merged/empty cells
        cell_texts = [""] * len(row)
        for i in range(len(row)):
            try:
                cell_texts[i] = _normalize_text(row.iloc[i])
            except Exception:
                cell_texts[i] = ""

        # forward-fill across time columns so merged cells spanning multiple time slots are applied
        last_nonempty = None
        for i in range(1, len(cell_texts)):
            if i >= len(time_columns):
                break
            if time_columns[i] is None:
                # break or lunch column resets the span
                last_nonempty = None
                continue
            if cell_texts[i]:
                last_nonempty = cell_texts[i]
            else:
                if last_nonempty:
                    cell_texts[i] = last_nonempty

        for col_idx in range(1, len(row)):
            if col_idx >= len(time_columns):
                continue
            time_range = time_columns[col_idx]
            if not time_range:
                continue
            cell_text = cell_texts[col_idx]
            if not cell_text or re.search(r"BREAK|LUNCH|NO CLASS", cell_text, flags=re.I):
                continue

            raw_subject = cell_text
            subject_code = _normalize_subject_code(raw_subject.split()[0]) if raw_subject else ""
            metadata_row = metadata.get(subject_code) or next((m for key, m in metadata.items() if key and key in _normalize_subject_code(raw_subject)), None)
            subject_name = metadata_row['subject_name'] if metadata_row and metadata_row.get('subject_name') else raw_subject
            faculty_name = metadata_row['staff_name'] if metadata_row and metadata_row.get('staff_name') else ""
            activity_type = _map_grid_activity_type(raw_subject)
            rows.append({
                'section': row_section or section_name,
                'department': row_department,
                'day': day_code,
                'start_time': time_range[0],
                'end_time': time_range[1],
                'subject': subject_name,
                'faculty_name': faculty_name,
                'activity_type': activity_type,
                'room': room_name,
                'raw_subject': raw_subject,
                'subject_code': subject_code,
            })

    if rows:
        return {
            'section': section_name,
            'room': room_name,
            'department': department_name,
            'semester': semester_value,
            'subject_metadata': metadata,
            'rows': rows,
            'time_columns': time_column_defs,
        }
    return None


def _import_grid_timetable(grid_data, preview_mode=False, timeslot_labels=None):
    errors = []
    valid_rows = []
    created_count = 0

    default_department = Department.objects.order_by('name').first()
    if not default_department:
        default_department = Department.objects.create(name='Default Department', code='DEF')

    # Normalize and optionally filter time_columns according to timeslot_labels
    time_columns = grid_data.get('time_columns') or []

    def _parse_label_to_range(lbl):
        if not lbl:
            return None
        parsed = _parse_time_token(lbl)
        if parsed:
            return (parsed[0], parsed[1])
        # try to find keywords
        l = str(lbl).upper()
        if 'BREAK' in l:
            return ('BREAK', 'BREAK')
        if 'LUNCH' in l:
            return ('LUNCH', 'LUNCH')
        return None

    desired_ranges = None
    if timeslot_labels:
        desired_ranges = set()
        for lbl in timeslot_labels:
            r = _parse_label_to_range(lbl)
            if r:
                desired_ranges.add(r)

    # filter time_columns preserving order
    filtered_time_columns = []
    for tc in time_columns:
        tc_range = (tc.get('start'), tc.get('end'))
        tc_label_range = _parse_label_to_range(tc.get('label') or '')
        include = True
        if desired_ranges is not None:
            include = False
            # if tc matches a desired start/end
            if tc_range in desired_ranges:
                include = True
            # if parsed label matches desired (for BREAK/LUNCH)
            if tc_label_range and tc_label_range in desired_ranges:
                include = True
            # also allow if desired ranges include BREAK/LUNCH and tc label contains keywords
            if any(x in (tc.get('label') or '').upper() for x in ('BREAK', 'LUNCH')) and any(dr[0] in ('BREAK', 'LUNCH') for dr in desired_ranges):
                include = True
        if include:
            filtered_time_columns.append(tc)

    # Replace time_columns with filtered set
    time_columns = filtered_time_columns

    # Prepare Timeslot map from (filtered) time columns so we can reference/create Timeslot records
    timeslot_map = {}
    for idx, tc in enumerate(time_columns):
        start = _normalize_time(tc.get('start'))
        end = _normalize_time(tc.get('end'))
        if not start or not end:
            continue
        # ensure seconds present for DB TimeField
        s_full = start if len(start.split(':')) == 3 else f"{start}:00"
        e_full = end if len(end.split(':')) == 3 else f"{end}:00"
        ts, created = Timeslot.objects.get_or_create(
            start_time=s_full,
            end_time=e_full,
            defaults={'label': tc.get('label') or f"{start}-{end}", 'order': idx, 'active': True}
        )
        timeslot_map[(start, end)] = ts

    for row_index, row in enumerate(grid_data['rows']):
        excel_row = row_index + 2
        row_errors = []

        section_value = _normalize_text(row.get('section') or grid_data.get('section') or "")
        section = None
        if not section_value:
            # Attempt to auto-create a section when missing: use department/semester metadata
            department_value = _normalize_text(row.get('department') or grid_data.get('department') or "")
            department = None
            if department_value:
                try:
                    department = _resolve_instance(department_value, Department, ['id', 'code', 'name'])
                except ValidationError:
                    department = Department.objects.create(name=department_value, code=department_value[:20].upper())
            if department is None:
                department = default_department

            sem_from_row = _parse_semester_text(row.get('semester') or grid_data.get('semester'))
            semester_int = sem_from_row or 1
            year_val = (semester_int + 1) // 2

            gen_name = (_normalize_text(grid_data.get('section')) or department.code or department.name or 'GEN')
            gen_name = (str(gen_name).split()[-1] if gen_name else 'GEN')
            proposed_section_name = f"{gen_name}-{semester_int or 1}"
            section, created = Section.objects.get_or_create(
                department=department,
                name=proposed_section_name,
                defaults={
                    'year': year_val,
                    'semester': semester_int,
                    'strength': 60,
                    'class_advisor': '',
                }
            )
            section_value = section.name
        else:
            # try resolve existing section normally
            try:
                section = _resolve_instance(section_value, Section, ['id', 'name', 'department__code'])
            except ValidationError:
                # create section with department from grid or default
                department = None
                department_value = _normalize_text(row.get('department') or grid_data.get('department'))
                if department_value:
                    dv_upper = department_value.upper()
                    if dv_upper.startswith('DEPARTMENT OF '):
                        department_value = department_value[len('DEPARTMENT OF '):].strip()
                    elif dv_upper.startswith('DEPARTMENT '):
                        parts = department_value.split()
                        if len(parts) > 1:
                            department_value = ' '.join(parts[1:]).strip()
                    try:
                        department = _resolve_instance(department_value, Department, ['id', 'code', 'name'])
                    except ValidationError:
                        department = Department.objects.create(name=department_value, code=department_value[:20].upper())
                if department is None:
                    department = default_department
                sem_from_row = _parse_semester_text(row.get('semester') or grid_data.get('semester'))
                semester_int = sem_from_row or 1
                year_val = (semester_int + 1) // 2

                section, _ = Section.objects.get_or_create(
                    department=department,
                    year=year_val,
                    name=section_value.split()[-1].strip() or 'A',
                    semester=semester_int,
                    defaults={'strength': 60, 'class_advisor': ''},
                )

        section = None
        try:
            section = _resolve_instance(section_value, Section, ['id', 'name', 'department__code'])
        except ValidationError:
            department = None
            department_value = _normalize_text(row.get('department') or grid_data.get('department'))
            if department_value:
                # normalize common prefixes like 'DEPARTMENT OF X' -> 'X'
                dv_upper = department_value.upper()
                if dv_upper.startswith('DEPARTMENT OF '):
                    department_value = department_value[len('DEPARTMENT OF '):].strip()
                elif dv_upper.startswith('DEPARTMENT '):
                    # e.g. 'DEPARTMENT IT' -> 'IT'
                    parts = department_value.split()
                    if len(parts) > 1:
                        department_value = ' '.join(parts[1:]).strip()
                try:
                    department = _resolve_instance(department_value, Department, ['id', 'code', 'name'])
                except ValidationError:
                    department = Department.objects.create(name=department_value, code=department_value[:20].upper())
            if department is None:
                department = default_department
            # determine semester/year from row or grid metadata
            sem_from_row = _parse_semester_text(row.get('semester') or grid_data.get('semester'))
            semester_int = sem_from_row or 1
            year_val = (semester_int + 1) // 2

            section, _ = Section.objects.get_or_create(
                department=department,
                year=year_val,
                name=section_value.split()[-1].strip() or 'A',
                semester=semester_int,
                defaults={'strength': 60, 'class_advisor': ''},
            )
        except Exception as exc:
            row_errors.append(f"Error resolving section: {str(exc)}")

        if not section:
            row_errors.append('Section could not be resolved')

        day = None
        try:
            day_value = _normalize_text(row.get('day'))
            if not day_value:
                row_errors.append('Day is required')
            else:
                try:
                    day = _normalize_choice(day_value, TimetableEntry.Day.choices)
                except ValidationError:
                    row_errors.append(f"Invalid day value: {day_value}")
        except Exception as exc:
            row_errors.append(f"Error processing day: {str(exc)}")

        start_time = row.get('start_time')
        end_time = row.get('end_time')
        if not start_time or not end_time:
            row_errors.append('Start time and end time are required')

        if row_errors:
            errors.append({'row': excel_row, 'errors': row_errors})
            continue

        # Lookup timeslot from prepared map or fallback to DB lookup/create
        timeslot = None
        if start_time and end_time:
            s_norm = _normalize_time(start_time)
            e_norm = _normalize_time(end_time)
            timeslot = timeslot_map.get((s_norm, e_norm))
            if not timeslot:
                # try DB lookup with seconds
                s_full = s_norm if len(s_norm.split(':')) == 3 else f"{s_norm}:00"
                e_full = e_norm if len(e_norm.split(':')) == 3 else f"{e_norm}:00"
                timeslot = Timeslot.objects.filter(start_time=s_full, end_time=e_full).first()

        room = None
        room_value = _normalize_text(grid_data.get('room') or row.get('room'))
        if room_value:
            try:
                room = _resolve_instance(room_value, Room, ['id', 'room_number'])
            except ValidationError:
                campus = Campus.objects.first() or Campus.objects.create(name='Main Campus')
                block = Block.objects.filter(campus=campus).first() or Block.objects.create(campus=campus, name='Main Block', code='MB')
                floor = Floor.objects.filter(block=block).order_by('number').first() or Floor.objects.create(block=block, number=0, name='Ground Floor')
                room = Room.objects.create(floor=floor, room_number=room_value, capacity=60)

        if section and room:
            section.permanent_room = room
            section.save(update_fields=['permanent_room'])

        payload = {
            'section': section.id,
            'subject': _normalize_text(row.get('subject')),
            'faculty_name': _normalize_text(row.get('faculty_name')),
            'activity_type': row.get('activity_type') or TimetableEntry.ActivityType.LECTURE,
            'day': day,
            'timeslot': timeslot.id if timeslot else None,
            'start_time': _normalize_time(start_time),
            'end_time': _normalize_time(end_time),
        }

        if preview_mode:
            section_label = section_value
            valid_rows.append({
                'row': excel_row,
                'data': {
                    'section': section_label,
                    'department': _normalize_text(row.get('department') or grid_data.get('department')),
                    'day': day,
                    'start_time': payload['start_time'],
                    'end_time': payload['end_time'],
                    'subject': payload['subject'],
                    'faculty_name': payload['faculty_name'],
                },
                'is_valid': True,
            })
        else:
            serializer = TimetableEntrySerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': excel_row, 'errors': serializer.errors})

    if preview_mode:
        # build grid-shaped preview using filtered time_columns
        grid_preview = None
        try:
            # time_columns has already been filtered earlier in this function
            timeslot_defs = []
            for tc in time_columns:
                timeslot_defs.append({'label': tc.get('label'), 'start': tc.get('start'), 'end': tc.get('end')})

            # build day->cells mapping
            days_map = {}
            for r in grid_data['rows']:
                d = r['day']
                days_map.setdefault(d, [])
            # initialize empty lists aligned with timeslot_defs
            for d in list(days_map.keys()):
                days_map[d] = [None] * len(timeslot_defs)

            # fill cells
            for r in grid_data['rows']:
                d = r['day']
                for idx, tc in enumerate(time_columns):
                    if r['start_time'] == tc.get('start') and r['end_time'] == tc.get('end'):
                        days_map[d][idx] = {
                            'section': r.get('section'),
                            'department': r.get('department'),
                            'subject': r.get('subject'),
                            'faculty_name': r.get('faculty_name'),
                            'activity_type': r.get('activity_type'),
                            'room': r.get('room'),
                        }

            grid_preview = {
                'timeslots': timeslot_defs,
                'days': days_map,
            }
        except Exception:
            grid_preview = None

        return {
            'import_type': 'timetable',
            'total_rows': len(grid_data['rows']),
            'valid_rows': len(valid_rows),
            'error_rows': len(errors),
            'valid_data': valid_rows[:50],
            'errors': errors[:50],
            'column_mapping': {},
            'grid_preview': grid_preview,
        }

    return {
        'imported': created_count,
        'skipped': len(errors),
        'errors': errors[:20],
    }


def _parse_csv_to_dataframe(uploaded_file, header=0, encoding=None):
    # Read CSV using Python's csv module so we can handle rows with varying column counts.
    file_bytes = uploaded_file.read()
    if isinstance(file_bytes, bytes):
        text = file_bytes.decode(encoding or 'utf-8-sig', errors='replace')
    else:
        text = str(file_bytes)
    uploaded_file.seek(0)

    reader = csv.reader(StringIO(text))
    rows = [row for row in reader]
    if not rows:
        raise pd.errors.EmptyDataError('No data found')

    # Normalize row length by padding short rows with empty strings.
    max_columns = max(len(row) for row in rows)
    normalized_rows = [row + [''] * (max_columns - len(row)) for row in rows]
    df = pd.DataFrame(normalized_rows)
    if header is not None:
        df.columns = df.iloc[header].tolist()
        df = df.drop(index=header).reset_index(drop=True)
    return df


def _parse_file(uploaded_file, header=0):
    name = (getattr(uploaded_file, 'name', '') or '').lower()
    # If name suggests CSV or no name provided, attempt CSV parsing first.
    if name.endswith(".csv") or not name:
        # Try common encodings and handle BOM (utf-8-sig, utf-16). Return DataFrame.
        for enc in (None, 'utf-8-sig', 'utf-16', 'latin1'):
            try:
                if enc is None:
                    return _parse_csv_to_dataframe(uploaded_file, header=header, encoding='utf-8-sig')
                return _parse_csv_to_dataframe(uploaded_file, header=header, encoding=enc)
            except (UnicodeDecodeError, pd.errors.EmptyDataError):
                try:
                    uploaded_file.seek(0)
                except Exception:
                    pass
                continue
    if name.endswith(('.xlsx', '.xls')):
        return pd.read_excel(uploaded_file, engine='openpyxl', header=header)

    # If we reach here, attempt CSV parsing as a last resort
    for enc in ('utf-8-sig', 'utf-16', 'latin1'):
        try:
            try:
                uploaded_file.seek(0)
            except Exception:
                pass
            return _parse_csv_to_dataframe(uploaded_file, header=header, encoding=enc)
        except Exception:
            continue

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

    # Only include 'id' in filters when the value is numeric to avoid type errors
    filters = []
    for field in lookup_fields:
        if field in ('id', 'pk') and not value.isdigit():
            continue
        filters.append({field: value})
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


def import_departments(uploaded_file, preview_mode=False):
    """
    Import departments with intelligent column mapping.
    If preview_mode=True, returns preview data without saving.
    """
    df = _parse_file(uploaded_file)
    import_type, column_mapping, df_norm = _detect_import_type_and_map_columns(df)
    
    if import_type != 'departments':
        raise ValidationError(f"File appears to be for {import_type} import, not departments. Please upload the correct file type.")
    
    required_fields = {'name', 'code'}
    found_fields = set(column_mapping.values())
    missing = required_fields - found_fields
    
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    errors = []
    valid_rows = []
    created_count = 0

    for row_index, row in df_norm.iterrows():
        excel_row = int(row_index) + 2
        mapped_row = _apply_column_mapping(row, column_mapping)
        row_errors = []

        # Extract required fields
        name = _normalize_text(mapped_row.get('name'))
        code = _normalize_text(mapped_row.get('code'))

        if not name:
            row_errors.append("Department name is required")
        if not code:
            row_errors.append("Department code is required")

        if row_errors:
            errors.append({'row': excel_row, 'errors': row_errors})
            continue

        # Extract optional fields
        hod_name = _normalize_text(mapped_row.get('hod_name'))

        # Build payload
        payload = {
            'name': name,
            'code': code,
            'hod_name': hod_name,
        }

        if preview_mode:
            valid_rows.append({
                'row': excel_row,
                'data': payload,
                'is_valid': True,
            })
        else:
            serializer = DepartmentSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': excel_row, 'errors': serializer.errors})

    if preview_mode:
        return {
            'import_type': 'departments',
            'total_rows': len(df_norm),
            'valid_rows': len(valid_rows),
            'error_rows': len(errors),
            'valid_data': valid_rows[:50],
            'errors': errors[:50],
            'column_mapping': column_mapping,
        }
    
    return created_count


def import_rooms(uploaded_file, preview_mode=False):
    """
    Import rooms with intelligent column mapping.
    If preview_mode=True, returns preview data without saving.
    """
    df = _parse_file(uploaded_file)
    import_type, column_mapping, df_norm = _detect_import_type_and_map_columns(df)
    
    if import_type != 'rooms':
        raise ValidationError(f"File appears to be for {import_type} import, not rooms. Please upload the correct file type.")
    
    required_fields = {'floor', 'room_number'}
    found_fields = set(column_mapping.values())
    missing = required_fields - found_fields
    
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    errors = []
    valid_rows = []
    created_count = 0

    for row_index, row in df_norm.iterrows():
        excel_row = int(row_index) + 2
        mapped_row = _apply_column_mapping(row, column_mapping)
        row_errors = []

        # Extract block (optional but helpful)
        block = None
        if 'block' in column_mapping.values() and mapped_row.get('block'):
            block_value = _normalize_text(mapped_row.get('block'))
            if block_value:
                try:
                    block = _resolve_instance(block_value, Block, ['id', 'code', 'name'])
                except ValidationError:
                    # Auto-create block if it doesn't exist
                    campus = Campus.objects.first()
                    if not campus:
                        campus = Campus.objects.create(name="Main Campus")
                    block, _ = Block.objects.get_or_create(
                        campus=campus,
                        name=block_value,
                        defaults={"code": block_value[:20]}
                    )

        # Extract floor (required)
        floor = None
        floor_value = _normalize_text(mapped_row.get('floor'))
        if not floor_value:
            row_errors.append("Floor is required")
        else:
            try:
                floor = _resolve_floor(floor_value, block=block)
            except ValidationError:
                # Try to auto-create floor
                try:
                    if not block:
                        campus = Campus.objects.first()
                        if not campus:
                            campus = Campus.objects.create(name="Main Campus")
                        block, _ = Block.objects.get_or_create(
                            campus=campus,
                            name="Main Block",
                            defaults={"code": "MB"}
                        )
                    
                    if floor_value.isdigit():
                        floor, _ = Floor.objects.get_or_create(
                            block=block,
                            number=int(floor_value),
                            defaults={"name": f"Floor {floor_value}"}
                        )
                    else:
                        floor, _ = Floor.objects.get_or_create(
                            block=block,
                            name=floor_value,
                            defaults={"number": 0}
                        )
                except Exception as e:
                    row_errors.append(f"Could not resolve or create floor: {str(e)}")

        # Extract room_number (required)
        room_number = _normalize_text(mapped_row.get('room_number'))
        if not room_number:
            row_errors.append("Room number is required")

        if row_errors:
            errors.append({'row': excel_row, 'errors': row_errors})
            continue

        # Extract optional fields
        room_type = Room.RoomType.CLASSROOM
        if 'room_type' in column_mapping.values() and mapped_row.get('room_type'):
            try:
                room_type = _normalize_choice(mapped_row.get('room_type'), Room.RoomType.choices) or Room.RoomType.CLASSROOM
            except Exception:
                pass

        status = Room.Status.FREE
        if 'status' in column_mapping.values() and mapped_row.get('status'):
            try:
                status = _normalize_choice(mapped_row.get('status'), Room.Status.choices) or Room.Status.FREE
            except Exception:
                pass

        capacity = 60
        try:
            cap_value = _normalize_text(mapped_row.get('capacity'))
            if cap_value:
                capacity = int(float(cap_value))
        except Exception:
            pass

        department = None
        if 'department' in column_mapping.values() and mapped_row.get('department'):
            try:
                department = _resolve_instance(_normalize_text(mapped_row.get('department')), Department, ['id', 'code', 'name'])
            except ValidationError:
                pass

        # Boolean fields
        has_projector = _normalize_bool(mapped_row.get('has_projector'))
        has_smart_board = _normalize_bool(mapped_row.get('has_smart_board'))
        is_computer_lab = _normalize_bool(mapped_row.get('is_computer_lab'))
        has_ac = _normalize_bool(mapped_row.get('has_ac'))
        has_wifi = _normalize_bool(mapped_row.get('has_wifi'))

        # Build payload
        payload = {
            'floor': floor.id,
            'room_number': room_number,
            'room_type': room_type,
            'capacity': capacity,
            'department': department.id if department else None,
            'status': status,
            'has_projector': has_projector,
            'has_smart_board': has_smart_board,
            'is_computer_lab': is_computer_lab,
            'has_ac': has_ac,
            'has_wifi': has_wifi,
        }

        if preview_mode:
            valid_rows.append({
                'row': excel_row,
                'data': {
                    'floor': str(floor),
                    'room_number': room_number,
                    'room_type': room_type,
                    'capacity': capacity,
                    'department': str(department) if department else None,
                    'status': status,
                },
                'is_valid': True,
            })
        else:
            serializer = RoomSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': excel_row, 'errors': serializer.errors})

    if preview_mode:
        return {
            'import_type': 'rooms',
            'total_rows': len(df_norm),
            'valid_rows': len(valid_rows),
            'error_rows': len(errors),
            'valid_data': valid_rows[:50],
            'errors': errors[:50],
            'column_mapping': column_mapping,
        }
    
    return created_count


def import_sections(uploaded_file, preview_mode=False):
    """
    Import sections with intelligent column mapping.
    If preview_mode=True, returns preview data without saving.
    """
    df = _parse_file(uploaded_file)
    import_type, column_mapping, df_norm = _detect_import_type_and_map_columns(df)
    
    if import_type != 'sections':
        raise ValidationError(f"File appears to be for {import_type} import, not sections. Please upload the correct file type.")
    
    required_fields = {'department', 'year', 'name'}
    found_fields = set(column_mapping.values())
    missing = required_fields - found_fields
    
    if missing:
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    errors = []
    valid_rows = []
    created_count = 0

    for row_index, row in df_norm.iterrows():
        excel_row = int(row_index) + 2
        mapped_row = _apply_column_mapping(row, column_mapping)
        row_errors = []

        # Extract department
        department = None
        try:
            dept_value = _normalize_text(mapped_row.get('department'))
            if not dept_value:
                row_errors.append("Department is required")
            else:
                try:
                    department = _resolve_instance(dept_value, Department, ['id', 'code', 'name'])
                except ValidationError:
                    row_errors.append(f"Department '{dept_value}' not found")
        except Exception as e:
            row_errors.append(f"Error resolving department: {str(e)}")

        # Extract year
        year = 1
        try:
            year_value = _normalize_text(mapped_row.get('year'))
            if year_value:
                year = int(year_value)
        except Exception as e:
            row_errors.append(f"Invalid year value: {str(e)}")

        # Extract name
        name = _normalize_text(mapped_row.get('name'))
        if not name:
            row_errors.append("Section name is required")

        if row_errors:
            errors.append({'row': excel_row, 'errors': row_errors})
            continue

        # Extract optional fields
        semester = 1
        try:
            sem_value = _normalize_text(mapped_row.get('semester'))
            if sem_value:
                semester = int(sem_value)
        except Exception:
            pass

        strength = 60
        try:
            str_value = _normalize_text(mapped_row.get('strength'))
            if str_value:
                strength = int(str_value)
        except Exception:
            pass

        class_advisor = _normalize_text(mapped_row.get('class_advisor'))

        # Extract permanent room if provided
        permanent_room = None
        if 'permanent_room' in column_mapping.values() and mapped_row.get('permanent_room'):
            try:
                room_value = _normalize_text(mapped_row.get('permanent_room'))
                try:
                    permanent_room = _resolve_instance(room_value, Room, ['id', 'room_number'])
                except ValidationError:
                    # Don't fail if room not found; just skip it
                    pass
            except Exception:
                pass

        # Build payload
        payload = {
            'department': department.id,
            'year': year,
            'name': name,
            'semester': semester,
            'strength': strength,
            'class_advisor': class_advisor,
            'permanent_room': permanent_room.id if permanent_room else None,
        }

        if preview_mode:
            valid_rows.append({
                'row': excel_row,
                'data': {
                    'department': str(department),
                    'year': year,
                    'name': name,
                    'semester': semester,
                    'strength': strength,
                    'class_advisor': class_advisor,
                    'permanent_room': str(permanent_room) if permanent_room else None,
                },
                'is_valid': True,
            })
        else:
            serializer = SectionSerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': excel_row, 'errors': serializer.errors})

    if preview_mode:
        return {
            'import_type': 'sections',
            'total_rows': len(df_norm),
            'valid_rows': len(valid_rows),
            'error_rows': len(errors),
            'valid_data': valid_rows[:50],
            'errors': errors[:50],
            'column_mapping': column_mapping,
        }
    
    return created_count


def import_timetable_entries(uploaded_file, preview_mode=False, timeslot_labels=None):
    """
    Import timetable entries with intelligent column mapping.
    If preview_mode=True, returns preview data without saving.
    If preview_mode=False, performs the import and reports skipped rows.
    """
    df = _parse_file(uploaded_file)
    import_type, column_mapping, df_norm = _detect_import_type_and_map_columns(df)

    # If the detected type isn't a flat timetable, try parsing as a grid-format timetable
    if import_type != 'timetable':
        try:
            uploaded_file.seek(0)
        except Exception:
            pass
        df_grid = _parse_file(uploaded_file, header=None)
        grid_data = _parse_grid_timetable(df_grid)
        if grid_data is not None:
            return _import_grid_timetable(grid_data, preview_mode=preview_mode, timeslot_labels=timeslot_labels)
        raise ValidationError(f"File appears to be for {import_type} import, not timetable. Please upload the correct file type.")

    # Ensure required flat columns exist; if not, try grid fallback
    required_fields = {'section', 'day', 'start_time', 'end_time'}
    found_fields = set(column_mapping.values())
    missing = required_fields - found_fields
    if missing:
        try:
            uploaded_file.seek(0)
        except Exception:
            pass
        df_grid = _parse_file(uploaded_file, header=None)
        grid_data = _parse_grid_timetable(df_grid)
        if grid_data is not None:
            return _import_grid_timetable(grid_data, preview_mode=preview_mode, timeslot_labels=timeslot_labels)
        raise ValidationError(f"Missing required columns: {', '.join(missing)}")

    errors = []
    valid_rows = []
    created_count = 0

    default_department = Department.objects.order_by('name').first()
    if not default_department:
        default_department = Department.objects.create(name='Default Department', code='DEF')

    for row_index, row in df_norm.iterrows():
        excel_row = int(row_index) + 2
        mapped_row = _apply_column_mapping(row, column_mapping)
        row_errors = []

        section = None
        try:
            section_value = _normalize_text(mapped_row.get('section'))
            if not section_value:
                row_errors.append("Section is required")
            else:
                try:
                    section = _resolve_instance(section_value, Section, ['id', 'name', 'department__code'])
                except ValidationError:
                    department = None
                    department_value = _normalize_text(mapped_row.get('department'))
                    if department_value:
                        try:
                            department = _resolve_instance(department_value, Department, ['id', 'code', 'name'])
                        except ValidationError:
                            department = Department.objects.create(name=department_value, code=department_value[:20].upper())
                    if department is None:
                        department = default_department

                    section, _ = Section.objects.get_or_create(
                        department=department,
                        year=1,
                        name=section_value.split()[-1].strip() or 'A',
                        semester=1,
                        defaults={'strength': 60, 'class_advisor': ''},
                    )
        except Exception as exc:
            row_errors.append(f"Error resolving section: {str(exc)}")

        day = None
        try:
            day_value = _normalize_text(mapped_row.get('day'))
            if not day_value:
                row_errors.append("Day is required")
            else:
                try:
                    day = _normalize_choice(day_value, TimetableEntry.Day.choices)
                except ValidationError:
                    row_errors.append(f"Invalid day value: {day_value}")
        except Exception as exc:
            row_errors.append(f"Error processing day: {str(exc)}")

        start_time = None
        end_time = None
        try:
            start_time = _normalize_time(mapped_row.get('start_time'))
            end_time = _normalize_time(mapped_row.get('end_time'))
            if not start_time or not end_time:
                row_errors.append("Start time and end time are required")
        except Exception as exc:
            row_errors.append(f"Error processing times: {str(exc)}")

        if row_errors:
            errors.append({'row': excel_row, 'errors': row_errors})
            continue

        timeslot = None
        if mapped_row.get('timeslot'):
            try:
                timeslot_value = _normalize_text(mapped_row.get('timeslot'))
                timeslot = _resolve_instance(timeslot_value, Timeslot, ['id', 'label'])
            except ValidationError:
                try:
                    timeslot = Timeslot.objects.filter(start_time=start_time, end_time=end_time).first()
                except Exception:
                    timeslot = None

        room = None
        if mapped_row.get('room'):
            room_value = _normalize_text(mapped_row.get('room'))
            if room_value:
                try:
                    room = _resolve_instance(room_value, Room, ['id', 'room_number'])
                except ValidationError:
                    if section and section.department:
                        campus = Campus.objects.first() or Campus.objects.create(name='Main Campus')
                        block = Block.objects.filter(campus=campus).first() or Block.objects.create(campus=campus, name='Main Block', code='MB')
                        floor = Floor.objects.filter(block=block).order_by('number').first() or Floor.objects.create(block=block, number=0, name='Ground Floor')
                        room = Room.objects.create(floor=floor, room_number=room_value, capacity=60)

        if section and room:
            section.permanent_room = room
            section.save(update_fields=['permanent_room'])

        payload = {
            'section': section.id,
            'subject': _normalize_text(mapped_row.get('subject')),
            'faculty_name': _normalize_text(mapped_row.get('faculty_name')),
            'activity_type': _normalize_choice(mapped_row.get('activity_type'), TimetableEntry.ActivityType.choices) or TimetableEntry.ActivityType.LECTURE,
            'day': day,
            'timeslot': timeslot.id if timeslot else None,
            'start_time': start_time,
            'end_time': end_time,
        }

        if preview_mode:
            valid_rows.append({
                'row': excel_row,
                'data': {
                    'section': str(section),
                    'day': day,
                    'start_time': start_time,
                    'end_time': end_time,
                    'subject': payload['subject'],
                    'faculty_name': payload['faculty_name'],
                },
                'is_valid': True,
            })
        else:
            serializer = TimetableEntrySerializer(data=payload)
            if serializer.is_valid():
                serializer.save()
                created_count += 1
            else:
                errors.append({'row': excel_row, 'errors': serializer.errors})

    if preview_mode:
        return {
            'import_type': 'timetable',
            'total_rows': len(df_norm),
            'valid_rows': len(valid_rows),
            'error_rows': len(errors),
            'valid_data': valid_rows[:50],
            'errors': errors[:50],
            'column_mapping': column_mapping,
        }

    return {
        'imported': created_count,
        'skipped': len(errors),
        'errors': errors[:20],
        }

    # Attempt grid-style timetable import when headers are missing or not standard
    try:
        uploaded_file.seek(0)
    except Exception:
        pass

    df_grid = _parse_file(uploaded_file, header=None)
    grid_data = _parse_grid_timetable(df_grid)
    if grid_data is None:
        raise ValidationError(f"File appears to be for {import_type} import, not timetable. Please upload the correct file type.")

    return _import_grid_timetable(grid_data, preview_mode=preview_mode)
