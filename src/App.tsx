import { Navigate, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { SiteListPage } from "./pages/SiteListPage";
import { SiteNewPage } from "./pages/SiteNewPage";
import { SiteEditPage } from "./pages/SiteEditPage";
import { SiteDetailPage } from "./pages/SiteDetailPage";
import { DailyReportPage } from "./pages/DailyReportPage";
import { MasterSettingsPage } from "./pages/MasterSettingsPage";
import { LaborManagementPage } from "./pages/LaborManagementPage";
import { AttendancePage } from "./pages/AttendancePage";
import { ContractorAdminPage } from "./pages/ContractorAdminPage";
import { ContractorViewPage } from "./pages/ContractorViewPage";
import { KouseiAdminPage } from "./pages/KouseiAdminPage";
import { KouseiPage } from "./pages/KouseiPage";
import { StaffListPage } from "./pages/StaffListPage";
import { StaffPersonalPage } from "./pages/StaffPersonalPage";
import { LeaveRequestsPage } from "./pages/LeaveRequestsPage";
import { PayslipsPage } from "./pages/PayslipsPage";
import { RosterPage } from "./pages/RosterPage";
import { ExternalSiteDetailPage } from "./pages/ExternalSiteDetailPage";
import { ExternalSitePortalPage } from "./pages/ExternalSitePortalPage";
import { ExternalHtmlKeyRedirect } from "./components/ExternalHtmlKeyRedirect";

export default function App() {
  return (
    <Routes>
      <Route path="/external.html" element={<ExternalHtmlKeyRedirect />} />
      <Route
        path="/external/:companyKey/site/:siteId"
        element={<ExternalSiteDetailPage />}
      />
      <Route
        path="/external/:companyKey"
        element={<ExternalSitePortalPage />}
      />
      <Route
        path="/sites/:siteId/daily-report"
        element={<DailyReportPage />}
      />
      <Route element={<Layout />}>
        <Route path="/" element={<SiteListPage />} />
        <Route path="/labor" element={<LaborManagementPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/staff" element={<StaffListPage />} />
        <Route path="/staff/:id" element={<StaffPersonalPage />} />
        <Route path="/leave-requests" element={<LeaveRequestsPage />} />
        <Route path="/payslips" element={<PayslipsPage />} />
        <Route path="/roster" element={<RosterPage />} />
        <Route path="/contractor" element={<ContractorAdminPage />} />
        <Route path="/contractor/view" element={<ContractorViewPage />} />
        <Route path="/kousei-admin" element={<KouseiAdminPage />} />
        <Route path="/kousei" element={<KouseiPage />} />
        <Route
          path="/settings/notifications"
          element={<Navigate to="/settings/masters" replace />}
        />
        <Route path="/master" element={<MasterSettingsPage />} />
        <Route path="/settings/masters" element={<MasterSettingsPage />} />
        <Route path="/sites/new" element={<SiteNewPage />} />
        <Route path="/sites/:siteId/edit" element={<SiteEditPage />} />
        <Route path="/sites/:siteId" element={<SiteDetailPage />} />
      </Route>
    </Routes>
  );
}
