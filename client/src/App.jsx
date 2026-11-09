import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { useT } from './lib/i18n.jsx';
import Layout from './components/Layout.jsx';
import { Spinner, Empty } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Register from './pages/Register.jsx';
import Compounds from './pages/Compounds.jsx';
import CompoundDetail from './pages/CompoundDetail.jsx';
import Units from './pages/Units.jsx';
import UnitDetail from './pages/UnitDetail.jsx';
import Owners from './pages/Owners.jsx';
import OwnerDetail from './pages/OwnerDetail.jsx';
import Vehicles from './pages/Vehicles.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import Plans from './pages/Plans.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import SubscriptionDetail from './pages/SubscriptionDetail.jsx';
import SubscriptionNew from './pages/SubscriptionNew.jsx';
import Renewals from './pages/Renewals.jsx';
import Payments from './pages/Payments.jsx';
import UsersRoles from './pages/UsersRoles.jsx';
import Staff from './pages/Staff.jsx';
import Operations from './pages/Operations.jsx';
import SettingsPage from './pages/Settings.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import PortalApp from './portal/PortalApp.jsx';
import StaffApp from './staff/StaffApp.jsx';
import SmsCenter from './pages/SmsCenter.jsx';
import RegistrationRequests from './pages/RegistrationRequests.jsx';

function Protected({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid h-full place-items-center text-slate-500"><Spinner className="text-brand-600" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.userType !== 'admin') return <div className="grid h-full place-items-center p-6"><Empty title="This portal is for administrators." /></div>;
  return children;
}

function Soon({ phase = 2 }) {
  const t = useT();
  return <Empty title={t(`common.phase${phase}`)} hint="This module is scaffolded in the database and API and will be delivered in the next phase." />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/p/*" element={<PortalApp />} />
      <Route path="/s/*" element={<StaffApp />} />
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="register" element={<Register />} />
        <Route path="compounds" element={<Compounds />} />
        <Route path="compounds/:id" element={<CompoundDetail />} />
        <Route path="units" element={<Units />} />
        <Route path="units/:id" element={<UnitDetail />} />
        <Route path="owners" element={<Owners />} />
        <Route path="owners/:id" element={<OwnerDetail />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="vehicles/:id" element={<VehicleDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="subscriptions/new" element={<SubscriptionNew />} />
        <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
        <Route path="renewals" element={<Renewals />} />
        <Route path="registration-requests" element={<RegistrationRequests />} />
        <Route path="payments" element={<Payments />} />
        <Route path="operations" element={<Operations />} />
        <Route path="staff" element={<Staff />} />
        <Route path="sms" element={<SmsCenter />} />
        <Route path="reports" element={<Soon phase={2} />} />
        <Route path="users" element={<UsersRoles />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
