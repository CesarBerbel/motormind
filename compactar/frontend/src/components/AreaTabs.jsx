import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasPermission } from "../auth/permissions";

const areaTabs = {
  attendance: [
    { to: "/attendance/dashboard", label: "Dashboard", permission: "dashboard.attendance" },
    { to: "/attendance/estimates", label: "Orçamentos", permission: "estimates.view" },
    { to: "/attendance/counter-sales", label: "Venda avulsa", permission: "counter_sales.view" },
    { to: "/work-orders", label: "OS", permission: "work_orders.view", end: true },
    { to: "/work-orders/kanban", label: "Kanban OS", permission: "work_orders.view" },
  ],
  finance: [
    { to: "/finance/dashboard", label: "Dashboard", permission: "finance.view" },
    { to: "/finance/cash-flow", label: "Fluxo de caixa", permission: "finance.view" },
    { to: "/finance/accounts-receivable", label: "A receber", permission: "finance.view" },
    { to: "/finance/accounts-payable", label: "A pagar", permission: "finance.view" },
    { to: "/purchasing/purchase-orders", label: "Compras", permission: "purchases.view" },
  ],
  technical: [
    { to: "/technical/workbench", label: "Bancada", permission: ["technical.dashboard", "dashboard.technical"] },
    { to: "/workshop-services", label: "Serviços", permission: "services.view" },
    { to: "/service-packages", label: "Pacotes", permission: "service_packages.view" },
  ],
  reports: [
    { to: "/reports/executive", label: "Executivo", permission: "reports.view" },
    { to: "/reports/work-orders", label: "OS", permission: "reports.view" },
    { to: "/reports/finance", label: "Financeiro", permission: "reports.view" },
    { to: "/reports/inventory", label: "Estoque", permission: "reports.view" },
  ],
  stock: [
    { to: "/parts", label: "Peças", permission: "parts.view" },
    { to: "/stock-movements", label: "Movimentos", permission: "stock.view" },
    { to: "/purchasing/purchase-orders", label: "Compras", permission: "purchases.view" },
    { to: "/purchasing/suppliers", label: "Fornecedores", permission: "suppliers.view" },
    { to: "/categories", label: "Categorias", permission: "categories.view" },
  ],
};

export default function AreaTabs({ area, className = "" }) {
  const { user } = useAuth();
  const tabs = (areaTabs[area] || []).filter((tab) => hasPermission(user, tab.permission));
  if (tabs.length <= 1) return null;

  return (
    <div className={`area-tabs ${className}`.trim()}>
      <div className="area-tabs-scroll">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end ?? true} className="area-tab-link">
            {tab.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
