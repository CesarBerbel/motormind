import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { dateInputValue, formatDate, money, workOrderStatuses } from "../workshopOptions";

function firstDay() { return dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }
async function downloadCsv(endpoint, params, filename) {
  const response = await api.get(endpoint, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function Kpi({ label, value }) { return <Col md={3}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>; }

export default function ReportsWorkOrdersPage() {
  const [filters, setFilters] = useState({ start_date: firstDay(), end_date: dateInputValue(), status: "", search: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try { setData((await api.get("/reports/work-orders/", { params: filters })).data); }
    catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function exportCsv() {
    try { await downloadCsv("/reports/work-orders/export.csv", filters, "relatorio-ordens-servico.csv"); }
    catch (err) { setError(apiError(err)); }
  }

  const s = data?.summary || {};
  return <>
    <PageHeader title="Relatório de ordens de serviço" subtitle="Faturamento, status, produtividade técnica, serviços e peças usados nas OS." actions={<Link className="btn btn-outline-secondary" to="/reports/executive">Dashboard executivo</Link>} />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Card className="border-0 shadow-sm mb-4"><Card.Body><Row className="g-3 align-items-end">
      <Col md={2}><Form.Label>Data inicial</Form.Label><Form.Control type="date" value={filters.start_date} onChange={(e)=>setFilters({...filters,start_date:e.target.value})}/></Col>
      <Col md={2}><Form.Label>Data final</Form.Label><Form.Control type="date" value={filters.end_date} onChange={(e)=>setFilters({...filters,end_date:e.target.value})}/></Col>
      <Col md={3}><Form.Label>Status</Form.Label><Form.Select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">Todos</option>{workOrderStatuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Form.Select></Col>
      <Col md={3}><Form.Label>Busca</Form.Label><Form.Control value={filters.search} placeholder="Número, cliente, placa..." onChange={(e)=>setFilters({...filters,search:e.target.value})}/></Col>
      <Col md="auto"><Button onClick={load} disabled={loading}>{loading?"Filtrando...":"Filtrar"}</Button></Col>
      <Col md="auto"><Button variant="outline-success" onClick={exportCsv}>Exportar CSV</Button></Col>
    </Row></Card.Body></Card>
    <Row className="g-3 mb-4"><Kpi label="OS no período" value={s.count || 0}/><Kpi label="Total em OS" value={money(s.total_amount)}/><Kpi label="Ticket médio" value={money(s.ticket_average)}/><Kpi label="Tempo médio entrega" value={`${s.average_delivery_hours || 0}h`}/></Row>
    <Row className="g-3 mb-4">
      <Col lg={6}><Card className="border-0 shadow-sm h-100"><Card.Header className="bg-white fw-semibold">Status</Card.Header><Card.Body>{(data?.status_breakdown||[]).map((row)=><div key={row.key} className="d-flex justify-content-between border-bottom py-2"><span>{row.label}</span><Badge bg="secondary">{row.count}</Badge></div>)}</Card.Body></Card></Col>
      <Col lg={6}><Card className="border-0 shadow-sm h-100"><Card.Header className="bg-white fw-semibold">Produtividade por técnico</Card.Header><Card.Body>{(data?.technician_breakdown||[]).length===0?<EmptyState text="Sem técnico atribuído no período."/>:(data?.technician_breakdown||[]).map((row)=><div key={row.technician_id||"none"} className="d-flex justify-content-between border-bottom py-2"><span>{row.technician_name}</span><span>{row.count} OS · {money(row.total)}</span></div>)}</Card.Body></Card></Col>
    </Row>
    <Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">Ordens de serviço</Card.Header><Card.Body className="p-0">{(data?.rows||[]).length===0?<EmptyState text="Nenhuma OS encontrada."/>:<Table responsive hover className="mb-0"><thead><tr><th>Número</th><th>Abertura</th><th>Cliente</th><th>Veículo</th><th>Status</th><th>Técnico</th><th>Total</th><th>Saldo</th><th></th></tr></thead><tbody>{data.rows.map((row)=><tr key={row.id}><td className="fw-semibold">{row.number}</td><td>{formatDate(row.opened_at)}</td><td>{row.customer_name}</td><td>{row.vehicle_display||"-"}</td><td><StatusBadge value={row.status} label={row.status_label}/></td><td>{row.technician_name}</td><td>{money(row.grand_total)}</td><td>{money(row.balance_due)}</td><td><Link to={`/work-orders/${row.id}`}>Abrir</Link></td></tr>)}</tbody></Table>}</Card.Body></Card>
  </>;
}
