import { Navigate, Route, Routes } from 'react-router-dom';
import { PortalProvider } from './portalLib.jsx';
import { PortalShell, RequireOwner } from './PortalLayout.jsx';
import RenewPage from './RenewPage.jsx';
import LoginPage from './LoginPage.jsx';
import { HomePage, VehiclesPage, VehicleDetailPage, RequestsPage } from './HomePages.jsx';
import WashesPage from './WashesPage.jsx';

export default function PortalApp() {
  return (
    <PortalProvider>
      <Routes>
        <Route path="renew/:token" element={<RenewPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireOwner><PortalShell /></RequireOwner>}>
          <Route path="home" element={<HomePage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="vehicles/:id" element={<VehicleDetailPage />} />
          <Route path="washes" element={<WashesPage />} />
          <Route path="requests" element={<RequestsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/p/login" replace />} />
      </Routes>
    </PortalProvider>
  );
}
