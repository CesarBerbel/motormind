import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Accordion, Badge, Button, Container, Navbar } from "react-bootstrap";
import { useAuth } from "../auth/AuthContext";
import { hasPermission } from "../auth/permissions";

const baseMenuGroups = [
  { title: "Atendimento", links: [["/dashboard/atendimento", "Landing atendimento", "dashboard.attendance"], ["/attendance/estimates", "Orçamentos", "estimates.view"], ["/attendance/counter-sales", "Venda avulsa", "counter_sales.view"], ["/work-orders", "OS - Lista", "work_orders.view"], ["/work-orders/kanban", "OS - Kanban", "work_orders.view"], ["/vehicles", "Veículos", "vehicles.view"], ["/contacts", "Clientes / contatos", "contacts.view"], ["/groups", "Grupos de contatos", "contacts.view"]] },
  { title: "Técnico", links: [["/dashboard/tecnico", "Landing técnico", ["technical.dashboard", "dashboard.technical"]], ["/technical/workbench", "Bancada técnica", ["technical.dashboard", "dashboard.technical"]], ["/workshop-services", "Serviços", "services.view"], ["/service-packages", "Pacotes", "service_packages.view"]] },
  { title: "Estoque", links: [["/dashboard/estoque", "Landing estoque", "dashboard.stock"], ["/parts", "Peças / estoque", "parts.view"], ["/stock-movements", "Movimentos", "stock.view"], ["/purchasing/purchase-orders", "Pedidos de compra", "purchases.view"], ["/purchasing/suppliers", "Fornecedores", "suppliers.view"], ["/categories", "Categorias", "categories.view"]] },
  { title: "Financeiro", links: [["/dashboard/financeiro", "Landing financeiro", "dashboard.finance"], ["/finance/dashboard", "Painel financeiro detalhado", "finance.view"], ["/finance/accounts-receivable", "Contas a receber", "finance.view"], ["/finance/accounts-payable", "Contas a pagar", "finance.view"], ["/finance/cash-flow", "Fluxo de caixa", "finance.view"], ["/purchasing/purchase-orders", "Pedidos de compra", "purchases.view"]] },
  { title: "Mensageria", links: [["/send", "Envio manual", "messages.send"], ["/templates", "Templates", "messaging.manage"], ["/automations", "Automações", "messaging.manage"], ["/history", "Histórico", "messaging.manage"], ["/message-dashboard", "Dashboard mensagens", "messaging.manage"], ["/notification-rules", "Notificações de OS", "messaging.manage"]] },
  { title: "Relatórios", links: [["/reports/executive", "Dashboard executivo", "reports.view"], ["/reports/work-orders", "Relatório de OS", "reports.view"], ["/reports/finance", "Relatório financeiro", "reports.view"], ["/reports/inventory", "Relatório de estoque", "reports.view"]] },
  { title: "Administração", links: [["/dashboard/administrativo", "Landing administrativo", "users.manage"], ["/settings", "Central administrativa", "settings.manage"], ["/users", "Usuários", "users.manage"], ["/system/health", "Saúde do sistema", "settings.manage"], ["/system/audit", "Auditoria", "settings.manage"], ["/categories", "Categorias", "categories.manage"]] },
];

function visibleGroups(user) {
  const dashboardGroup = { title: "Meu setor", links: [[user?.dashboard_path || "/", "Minha landing page", "authenticated"]] };
  return [dashboardGroup, ...baseMenuGroups]
    .map((group) => ({ ...group, links: group.links.filter(([, , permission]) => hasPermission(user, permission)) }))
    .filter((group) => group.links.length > 0);
}

function groupIsActive(group, pathname) {
  return group.links.some(([to]) => pathname === to || pathname.startsWith(`${to}/`));
}

function initials(name) {
  return String(name || "OF")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Layout() {
  const { user, workshopProfile, logout } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "true");
  const groups = visibleGroups(user);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  function toggleSidebar() {
    setSidebarCollapsed((current) => !current);
  }
  const defaultOpenGroups = useMemo(() => {
    const active = groups.filter((group) => groupIsActive(group, location.pathname)).map((group) => group.title);
    return active.length ? active : groups.slice(0, 1).map((group) => group.title);
  }, [groups, location.pathname]);

  const workshopName = workshopProfile?.display_name || workshopProfile?.trade_name || workshopProfile?.legal_name || "Oficina Admin";
  const userName = user?.full_name || user?.username || "Usuário";
  const isKanbanRoute = location.pathname === "/work-orders/kanban";
  const contentClassName = `py-4 px-4 ${isKanbanRoute ? "content-full-width" : ""}`;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isKanbanRoute ? "kanban-shell" : ""}`.trim()}>
      <aside className="sidebar" aria-label="Menu lateral principal">
        <div className="sidebar-inner p-3">
          <div className="sidebar-brand mb-3">
            {workshopProfile?.logo_url ? (
              <img src={workshopProfile.logo_url} alt={`Logo ${workshopName}`} className="sidebar-brand-logo" />
            ) : (
              <div className="sidebar-brand-fallback">{initials(workshopName)}</div>
            )}
            <div className="sidebar-expanded-only min-width-0">
              <h4 className="mb-1 text-truncate">{workshopName}</h4>
              <div className="small text-white-50 text-truncate">Sistema de gestão da oficina</div>
            </div>
            <button
              type="button"
              className="sidebar-toggle sidebar-expanded-only ms-auto"
              onClick={toggleSidebar}
              aria-label="Recolher menu lateral"
              title="Recolher menu"
            >
              <span aria-hidden="true">‹</span>
            </button>
          </div>

          <button
            type="button"
            className="sidebar-rail-button sidebar-collapsed-only"
            onClick={toggleSidebar}
            aria-label="Abrir menu lateral"
            title="Abrir menu"
          >
            <span className="sidebar-rail-icon" aria-hidden="true">☰</span>
          </button>

          <div className="sidebar-user mb-4 sidebar-expanded-only">
            <div className="small text-white-50">Logado como</div>
            <div className="fw-semibold text-truncate">{userName}</div>
            <div className="small text-white-50 text-truncate">{user?.email || "Email não informado"}</div>
            {user?.role_label ? <Badge bg="secondary" className="mt-2">{user.role_label}</Badge> : null}
          </div>

          <div className="sidebar-collapsed-only sidebar-rail-brand" title={workshopName}>
            {workshopProfile?.logo_url ? (
              <img src={workshopProfile.logo_url} alt="" className="sidebar-rail-logo" />
            ) : (
              <span>{initials(workshopName)}</span>
            )}
          </div>

          <Accordion alwaysOpen defaultActiveKey={defaultOpenGroups} className="sidebar-accordion sidebar-expanded-only">
            {groups.map((group) => (
              <Accordion.Item eventKey={group.title} key={group.title} className="sidebar-accordion-item">
                <Accordion.Header><span>{group.title}</span><Badge bg="secondary" className="ms-auto me-2">{group.links.length}</Badge></Accordion.Header>
                <Accordion.Body>
                  <nav className="sidebar-submenu">
                    {group.links.map(([to, label]) => (
                      <NavLink key={`${group.title}-${to}`} to={to} end={to === "/work-orders"} className="sidebar-link rounded px-3 py-2">{label}</NavLink>
                    ))}
                  </nav>
                </Accordion.Body>
              </Accordion.Item>
            ))}
          </Accordion>
        </div>
      </aside>
      <div className="main-content">
        <Navbar bg="white" className="border-bottom px-3 top-navbar">
          <Container fluid>
            <div className="d-flex align-items-center gap-2 min-width-0">
              <Button
                variant="outline-secondary"
                size="sm"
                className="top-sidebar-toggle"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "Abrir menu lateral" : "Recolher menu lateral"}
                title={sidebarCollapsed ? "Abrir menu" : "Recolher menu"}
              >
                <span aria-hidden="true">☰</span>
              </Button>
              <Navbar.Text className="text-truncate">
                <strong>{workshopName}</strong>
                <span className="text-muted ms-2">{userName}</span>
                {user?.technician_specialty_label ? <Badge bg="info" className="ms-2">{user.technician_specialty_label}</Badge> : null}
              </Navbar.Text>
            </div>
            <Button variant="outline-secondary" size="sm" onClick={logout}>Sair</Button>
          </Container>
        </Navbar>
        <Container fluid className={contentClassName}><Outlet /></Container>
      </div>
    </div>
  );
}
