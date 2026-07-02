import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import CampusStructure from "./pages/CampusStructure";
import Departments from "./pages/Departments";
import Rooms from "./pages/Rooms";
import Sections from "./pages/Sections";
import Timetable from "./pages/Timetable";
import FreeRoomFinder from "./pages/FreeRoomFinder";
import Allocations from "./pages/Allocations";
import UserManagement from "./pages/UserManagement";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/timetable" element={<Timetable />} />
              <Route path="/free-rooms" element={<FreeRoomFinder />} />
              <Route path="/allocations" element={<Allocations />} />

              <Route element={<ProtectedRoute allow={["SUPER_ADMIN"]} />}>
                <Route path="/campus" element={<CampusStructure />} />
                <Route path="/departments" element={<Departments />} />
                <Route path="/users" element={<UserManagement />} />
              </Route>

              <Route element={<ProtectedRoute allow={["SUPER_ADMIN", "DEPT_ADMIN"]} />}>
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/sections" element={<Sections />} />
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
