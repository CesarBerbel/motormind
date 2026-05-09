ROLE_OWNER = "owner"
ROLE_ADMINISTRATIVE = "administrative"
ROLE_ATTENDANT = "attendant"
ROLE_STOCK = "stock"
ROLE_TECHNICIAN = "technician"
ROLE_FINANCE = "finance"

TECH_MECHANIC = "mechanic"
TECH_BODYWORK = "bodywork"
TECH_ELECTRICIAN = "electrician"

ROLE_CHOICES = [
    (ROLE_OWNER, "Dono"),
    (ROLE_ADMINISTRATIVE, "Administrativo"),
    (ROLE_ATTENDANT, "Atendente"),
    (ROLE_STOCK, "Estoque"),
    (ROLE_TECHNICIAN, "Técnico"),
    (ROLE_FINANCE, "Financeiro"),
]

TECHNICIAN_SPECIALTY_CHOICES = [
    (TECH_MECHANIC, "Mecânico"),
    (TECH_BODYWORK, "Funileiro"),
    (TECH_ELECTRICIAN, "Eletricista"),
]

ROLE_GROUP_NAMES = {
    ROLE_OWNER: "Dono",
    ROLE_ADMINISTRATIVE: "Administrativo",
    ROLE_ATTENDANT: "Atendente",
    ROLE_STOCK: "Estoque",
    ROLE_TECHNICIAN: "Técnico",
    ROLE_FINANCE: "Financeiro",
}

DASHBOARD_PATHS = {
    ROLE_OWNER: "/dashboard/dono",
    ROLE_ADMINISTRATIVE: "/dashboard/administrativo",
    ROLE_ATTENDANT: "/dashboard/atendimento",
    ROLE_STOCK: "/dashboard/estoque",
    ROLE_TECHNICIAN: "/dashboard/tecnico",
    ROLE_FINANCE: "/dashboard/financeiro",
}

ALL_PERMISSION = "*"

ROLE_PERMISSIONS = {
    ROLE_OWNER: [ALL_PERMISSION],
    ROLE_ADMINISTRATIVE: [ALL_PERMISSION],
    ROLE_ATTENDANT: [
        "dashboard.attendance",
        "contacts.view",
        "contacts.manage",
        "vehicles.view",
        "vehicles.manage",
        "services.view",
        "service_packages.view",
        "work_orders.view",
        "work_orders.create",
        "work_orders.edit",
        "work_orders.status",
        "estimates.view",
        "estimates.manage",
        "counter_sales.view",
        "counter_sales.manage",
        "payments.view",
        "payments.manage",
        "work_order_services.view",
        "work_order_services.manage",
        "messages.send",
        "reports.view",
    ],
    ROLE_STOCK: [
        "dashboard.stock",
        "categories.view",
        "categories.manage",
        "parts.view",
        "parts.manage",
        "stock.view",
        "stock.adjust",
        "suppliers.view",
        "suppliers.manage",
        "purchases.view",
        "purchases.manage",
        "work_orders.view",
        "work_order_parts.view",
        "work_order_parts.manage",
        "reports.view",
    ],
    ROLE_TECHNICIAN: [
        "dashboard.technical",
        "technical.dashboard",
        "technical.execute",
        "services.view",
        "work_orders.view",
        "work_orders.status",
        "work_order_services.view",
        "work_order_services.manage",
        "reports.view",
    ],
    ROLE_FINANCE: [
        "dashboard.finance",
        "contacts.view",
        "vehicles.view",
        "work_orders.view",
        "counter_sales.view",
        "estimates.view",
        "payments.view",
        "payments.manage",
        "finance.view",
        "finance.manage",
        "purchases.view",
        "purchases.approve",
        "reports.view",
    ],
}
