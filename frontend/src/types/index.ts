export type Role = "SUPER_ADMIN" | "DEPT_ADMIN" | "FACULTY" | "STUDENT";

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  phone?: string | null;
  department?: number | null;
  department_name?: string | null;
  is_active: boolean;
  date_joined: string;
}

export interface Campus {
  id: number;
  name: string;
  address?: string;
}

export interface Block {
  id: number;
  campus: number;
  campus_name?: string;
  name: string;
  code?: string;
}

export interface Floor {
  id: number;
  block: number;
  block_name?: string;
  number: number;
  name?: string;
}

export interface Department {
  id: number;
  name: string;
  code: string;
  hod_name?: string;
}

export type RoomType = "CLASSROOM" | "LAB" | "SEMINAR_HALL" | "LIBRARY" | "AUDITORIUM" | "OTHER";
export type RoomStatus = "FREE" | "ALLOCATED" | "OCCUPIED" | "RESERVED" | "MAINTENANCE";

export interface Room {
  id: number;
  floor: number;
  block?: number | null;
  block_name?: string;
  floor_number?: number;
  room_number: string;
  room_type: RoomType;
  capacity: number;
  department?: number | null;
  department_code?: string | null;
  status: RoomStatus;
  has_projector: boolean;
  has_smart_board: boolean;
  is_computer_lab: boolean;
  has_ac: boolean;
  has_wifi: boolean;
}

export interface Section {
  id: number;
  department: number;
  department_code?: string;
  year: number;
  name: string;
  semester: number;
  strength: number;
  class_advisor?: string;
  permanent_room?: number | null;
  permanent_room_number?: string | null;
  permanent_room_block_name?: string | null;
  permanent_room_floor_number?: number | null;
  permanent_room_floor_name?: string | null;
  label?: string;
}

export type Day = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type ActivityType =
  | "LECTURE" | "LAB" | "LIBRARY" | "SEMINAR" | "WORKSHOP" | "SPORTS" | "INTERNSHIP" | "EXAM" | "HOLIDAY";

export interface TimetableEntry {
  id: number;
  section: number;
  section_label?: string;
  room: number | null;
  room_number?: string | null;
  subject?: string;
  faculty_name?: string;
  activity_type: ActivityType;
  day: Day;
  start_time?: string;
  end_time?: string;
  timeslot?: number;
  timeslot_label?: string;
}

export interface Timeslot {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
  order?: number;
  active?: boolean;
}

export type AllocationStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";

export interface TemporaryAllocation {
  id: number;
  room: number;
  room_number?: string;
  room_block_name?: string;
  section: number;
  section_label?: string;
  section_year?: number;
  day: Day;
  start_time: string;
  end_time: string;
  reason?: string;
  status: AllocationStatus;
  requested_by?: number;
  requested_by_name?: string;
  created_at: string;
}

export interface DashboardStats {
  total_blocks: number;
  total_floors: number;
  total_rooms: number;
  occupied_rooms: number;
  available_rooms: number;
  todays_classes: number;
  todays_labs: number;
  temporary_allocations_today: number;
  pending_requests: number;
  total_departments: number;
  total_sections: number;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
