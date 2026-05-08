import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import { dateInputValue, formatDate, money } from "../workshopOptions";

function firstDay() { return dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }
function Kpi({ label, value, tone = "" }) { return <Col md={3}><Card className={`card-kpi h-100 ${tone}`}><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>; }
async function downloadCsv(endpoint, params, filename) { const response = await api.get(endpoint, { params, responseType: "blob" }); const url = window.URL.createObjectURL(new Blob([response.data])); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); }

const variant = { open: "primary", partial: "warning", paid: "success", overdue: "danger", cancelled: "secondary" };

export default function ReportsFinancePage() {
  const [filters, setFilters] = useState({ start_date: firstDay(), end_date: dateInputValue() });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); setError(""); try { setData((await api.get("/reports/finance/", { params: filters })).data); } catch (err) { setError(apiError(err)); } finally { setLoading(false); } }
  useEffect(()=>{load();},[]);
  async function exportCsv(){ try{ await downloadCsv("/reports/finance/export.csv", filters, "relatorio-financeiro.csv"); } catch(err){ setError(apiError(err)); } }
  const s = data?.summary || {};
  return <>
    <PageHeader title="Relatório financeiro" subtitle="Receitas, despesas, saldo previsto, contas vencidas e movimentação por período." actions={<Link className="btn btn-outline-secondary" to="/reports/executive">Dashboard executivo</Link>} />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Card className="border-0 shadow-sm mb-4"><Card.Body><Row className="g-3 align-items-end"><Col md={3}><Form.Label>Data inicial</Form.Label><Form.Control type="date" value={filters.start_date} onChange={(e)=>setFilters({...filters,start_date:e.target.value})}/></Col><Col md={3}><Form.Label>Data final</Form.Label><Form.Control type="date" value={filters.end_date} onChange={(e)=>setFilters({...filters,end_date:e.target.value})}/></Col><Col md="auto"><Button onClick={load} disabled={loading}>{loading?"Filtrando...":"Filtrar"}</Button></Col><Col md="auto"><Button variant="outline-success" onClick={exportCsv}>Exportar CSV</Button></Col></Row></Card.Body></Card>
    <Row className="g-3 mb-4"><Kpi label="Recebido" value={money(s.received_period)}/><Kpi label="Pago" value={money(s.paid_period)}/><Kpi label="Resultado" value={money(s.net_period)}/><Kpi label="A receber aberto" value={money(s.receivable_open)}/><Kpi label="A pagar aberto" value={money(s.payable_open)}/><Kpi label="Recebíveis vencidos" value={s.overdue_receivables || 0}/><Kpi label="Pagáveis vencidos" value={s.overdue_payables || 0}/><Kpi label="Saldo previsto" value={money(Number(s.receivable_open||0)-Number(s.payable_open||0))}/></Row>
    <Row className="g-3 mb-4"><Col lg={6}><Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">A receber por status</Card.Header><Card.Body>{(data?.receivable_status_breakdown||[]).map((row)=><div className="d-flex justify-content-between border-bottom py-2" key={row.key}><span>{row.label}</span><Badge bg={variant[row.key]||"secondary"}>{row.count}</Badge></div>)}</Card.Body></Card></Col><Col lg={6}><Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">A pagar por status</Card.Header><Card.Body>{(data?.payable_status_breakdown||[]).map((row)=><div className="d-flex justify-content-between border-bottom py-2" key={row.key}><span>{row.label}</span><Badge bg={variant[row.key]||"secondary"}>{row.count}</Badge></div>)}</Card.Body></Card></Col></Row>
    <Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">Contas do período</Card.Header><Card.Body className="p-0">{(data?.rows||[]).length===0?<EmptyState text="Nenhuma conta encontrada."/>:<Table responsive hover className="mb-0"><thead><tr><th>Tipo</th><th>Número</th><th>Descrição</th><th>Cliente/Fornecedor</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Saldo</th><th>Status</th></tr></thead><tbody>{data.rows.map((row)=><tr key={`${row.type}-${row.id}`}><td>{row.type_label}</td><td className="fw-semibold">{row.number}</td><td>{row.description}</td><td>{row.party_name || "-"}</td><td>{formatDate(row.due_date)}</td><td>{money(row.amount)}</td><td>{money(row.paid_amount)}</td><td>{money(row.balance_amount)}</td><td><Badge bg={variant[row.status]||"secondary"}>{row.status_label}</Badge></td></tr>)}</tbody></Table>}</Card.Body></Card>
  </>;
}
