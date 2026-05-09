import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { defaultDashboardPath, hasPermission } from "./auth/permissions";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import SetPasswordPage from "./pages/SetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ContactsPage from "./pages/ContactsPage";
import ContactGroupsPage from "./pages/ContactGroupsPage";
import TemplatesPage from "./pages/TemplatesPage";
import TemplateFormPage from "./pages/TemplateFormPage";
import SendManualPage from "./pages/SendManualPage";
import AutomationsPage from "./pages/AutomationsPage";
import AutomationFormPage from "./pages/AutomationFormPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";
import WorkOrdersPage from "./pages/WorkOrdersPage";
import WorkOrderFormPage from "./pages/WorkOrderFormPage";
import WorkOrderDetailPage from "./pages/WorkOrderDetailPage";
import WorkOrdersKanbanPage from "./pages/WorkOrdersKanbanPage";
import WorkOrdersAgendaPage from "./pages/WorkOrdersAgendaPage";
import VehiclesPage from "./pages/VehiclesPage";
import CategoriesPage from "./pages/CategoriesPage";
import WorkshopServicesPage from "./pages/WorkshopServicesPage";
import ServicePackagesPage from "./pages/ServicePackagesPage";
import PartsPage from "./pages/PartsPage";
import StockMovementsPage from "./pages/StockMovementsPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import FinancePayablesPage from "./pages/FinancePayablesPage";
import FinanceReceivablesPage from "./pages/FinanceReceivablesPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import SuppliersPage from "./pages/SuppliersPage";
import NotificationRulesPage from "./pages/NotificationRulesPage";
import AreaDashboardPage from "./pages/AreaDashboardPage";
import TechnicalWorkbenchPage from "./pages/TechnicalWorkbenchPage";
import AttendanceDashboardPage from "./pages/AttendanceDashboardPage";
import CounterSalesPage from "./pages/CounterSalesPage";
import CounterSaleFormPage from "./pages/CounterSaleFormPage";
import EstimatesPage from "./pages/EstimatesPage";
import EstimateFormPage from "./pages/EstimateFormPage";
import FinanceReceivableFormPage from "./pages/FinanceReceivableFormPage";
import FinanceCashFlowPage from "./pages/FinanceCashFlowPage";
import SystemHealthPage from "./pages/SystemHealthPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import CustomerApprovalPage from "./pages/CustomerApprovalPage";
import LandingPage from "./pages/LandingPage";
import ReportsExecutivePage from "./pages/ReportsExecutivePage";
import ReportsWorkOrdersPage from "./pages/ReportsWorkOrdersPage";
import ReportsFinancePage from "./pages/ReportsFinancePage";
import ReportsInventoryPage from "./pages/ReportsInventoryPage";
import { Modal } from "react-bootstrap";


function FloatingRouteForm({ backTo, title, children }) {
  const navigate = useNavigate();
  return (
    <Modal show size="xl" onHide={() => navigate(backTo)} className="floating-form-modal" dialogClassName="modal-floating-form" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {children}
      </Modal.Body>
    </Modal>
  );
}

function AccessDenied() {
  return (
    <div className="p-5">
      <h3>Acesso negado</h3>
      <p className="text-muted mb-0">Seu grupo de usuário não possui permissão para acessar esta área.</p>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-5">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_active) return <AccessDenied />;
  return children;
}

function Guard({ permission, children }) {
  const { user } = useAuth();
  if (!hasPermission(user, permission)) return <AccessDenied />;
  return children;
}

function DashboardRedirect() {
  const { user } = useAuth();
  return <Navigate to={defaultDashboardPath(user)} replace />;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-5">Carregando...</div>;
  if (user) return <Navigate to={defaultDashboardPath(user)} replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/definir-senha/:uidb64/:token" element={<SetPasswordPage />} />
        <Route path="/aprovar-os/:token" element={<CustomerApprovalPage />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="dashboard/:area" element={<AreaDashboardPage />} />
          <Route path="attendance/dashboard" element={<Guard permission="dashboard.attendance"><AttendanceDashboardPage /></Guard>} />
          <Route path="attendance/counter-sales" element={<Guard permission="counter_sales.view"><CounterSalesPage /></Guard>} />
          <Route path="attendance/counter-sales/new" element={<Guard permission="counter_sales.manage"><FloatingRouteForm backTo="/attendance/counter-sales" title="Nova venda avulsa"><CounterSaleFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="attendance/estimates" element={<Guard permission="estimates.view"><EstimatesPage /></Guard>} />
          <Route path="attendance/estimates/new" element={<Guard permission="estimates.manage"><FloatingRouteForm backTo="/attendance/estimates" title="Novo orçamento"><EstimateFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="message-dashboard" element={<Guard permission="messaging.manage"><DashboardPage /></Guard>} />
          <Route path="work-orders" element={<Guard permission="work_orders.view"><WorkOrdersPage /></Guard>} />
          <Route path="work-orders/new" element={<Guard permission="work_orders.create"><FloatingRouteForm backTo="/work-orders" title="Nova ordem de serviço"><WorkOrderFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="work-orders/kanban" element={<Guard permission="work_orders.view"><WorkOrdersKanbanPage /></Guard>} />
          <Route path="work-orders/agenda" element={<Guard permission="work_orders.view"><WorkOrdersAgendaPage /></Guard>} />
          <Route path="work-orders/:id" element={<Guard permission="work_orders.view"><WorkOrderDetailPage /></Guard>} />
          <Route path="work-orders/:id/edit" element={<Guard permission="work_orders.edit"><FloatingRouteForm backTo="/work-orders" title="Editar ordem de serviço"><WorkOrderFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="vehicles" element={<Guard permission="vehicles.view"><VehiclesPage /></Guard>} />
          <Route path="categories" element={<Guard permission="categories.view"><CategoriesPage /></Guard>} />
          <Route path="technical/workbench" element={<Guard permission={["technical.dashboard", "dashboard.technical"]}><TechnicalWorkbenchPage /></Guard>} />
          <Route path="workshop-services" element={<Guard permission="services.view"><WorkshopServicesPage /></Guard>} />
          <Route path="service-packages" element={<Guard permission="service_packages.view"><ServicePackagesPage /></Guard>} />
          <Route path="parts" element={<Guard permission="parts.view"><PartsPage /></Guard>} />
          <Route path="stock-movements" element={<Guard permission="stock.view"><StockMovementsPage /></Guard>} />
          <Route path="finance/dashboard" element={<Guard permission="finance.view"><FinanceDashboardPage /></Guard>} />
          <Route path="finance/accounts-receivable" element={<Guard permission="finance.view"><FinanceReceivablesPage /></Guard>} />
          <Route path="finance/accounts-receivable/new" element={<Guard permission="finance.manage"><FloatingRouteForm backTo="/finance/accounts-receivable" title="Nova conta a receber"><FinanceReceivableFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="finance/cash-flow" element={<Guard permission="finance.view"><FinanceCashFlowPage /></Guard>} />
          <Route path="finance/accounts-payable" element={<Guard permission="finance.view"><FinancePayablesPage /></Guard>} />
          <Route path="purchasing/purchase-orders" element={<Guard permission="purchases.view"><PurchaseOrdersPage /></Guard>} />
          <Route path="purchasing/suppliers" element={<Guard permission="suppliers.view"><SuppliersPage /></Guard>} />
          <Route path="notification-rules" element={<Guard permission="messaging.manage"><NotificationRulesPage /></Guard>} />
          <Route path="contacts" element={<Guard permission="contacts.view"><ContactsPage /></Guard>} />
          <Route path="groups" element={<Guard permission="contacts.view"><ContactGroupsPage /></Guard>} />
          <Route path="templates" element={<Guard permission="messaging.manage"><TemplatesPage /></Guard>} />
          <Route path="templates/new" element={<Guard permission="messaging.manage"><FloatingRouteForm backTo="/templates" title="Novo template"><TemplateFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="templates/:id" element={<Guard permission="messaging.manage"><FloatingRouteForm backTo="/templates" title="Editar template"><TemplateFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="send" element={<Guard permission="messages.send"><SendManualPage /></Guard>} />
          <Route path="automations" element={<Guard permission="messaging.manage"><AutomationsPage /></Guard>} />
          <Route path="automations/new" element={<Guard permission="messaging.manage"><FloatingRouteForm backTo="/automations" title="Nova automação"><AutomationFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="automations/:id" element={<Guard permission="messaging.manage"><FloatingRouteForm backTo="/automations" title="Editar automação"><AutomationFormPage embedded /></FloatingRouteForm></Guard>} />
          <Route path="history" element={<Guard permission="messaging.manage"><HistoryPage /></Guard>} />
          <Route path="settings" element={<Guard permission="settings.manage"><SettingsPage /></Guard>} />
          <Route path="users" element={<Guard permission="users.manage"><UsersPage /></Guard>} />
          <Route path="system/health" element={<Guard permission="settings.manage"><SystemHealthPage /></Guard>} />
          <Route path="reports/executive" element={<Guard permission="reports.view"><ReportsExecutivePage /></Guard>} />
          <Route path="reports/work-orders" element={<Guard permission="reports.view"><ReportsWorkOrdersPage /></Guard>} />
          <Route path="reports/finance" element={<Guard permission="reports.view"><ReportsFinancePage /></Guard>} />
          <Route path="reports/inventory" element={<Guard permission="reports.view"><ReportsInventoryPage /></Guard>} />
          <Route path="system/audit" element={<Guard permission="settings.manage"><AuditLogsPage /></Guard>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
