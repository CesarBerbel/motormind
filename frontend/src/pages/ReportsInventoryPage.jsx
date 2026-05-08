import React, { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import { dateInputValue, money } from "../workshopOptions";

function firstDay() { return dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }
function Kpi({ label, value }) { return <Col md={3}><Card className="card-kpi h-100"><Card.Body><div className="text-muted small">{label}</div><div className="display-6 fw-bold">{value}</div></Card.Body></Card></Col>; }
async function downloadCsv(endpoint, params, filename) { const response = await api.get(endpoint, { params, responseType: "blob" }); const url = window.URL.createObjectURL(new Blob([response.data])); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); }

export default function ReportsInventoryPage() {
  const [filters, setFilters] = useState({ start_date: firstDay(), end_date: dateInputValue(), search: "", low_stock: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() { setLoading(true); setError(""); try { setData((await api.get("/reports/inventory/", { params: filters })).data); } catch (err) { setError(apiError(err)); } finally { setLoading(false); } }
  useEffect(()=>{load();},[]);
  async function exportCsv(){ try{ await downloadCsv("/reports/inventory/export.csv", filters, "relatorio-estoque.csv"); } catch(err){ setError(apiError(err)); } }
  const s = data?.summary || {};
  return <>
    <PageHeader title="Relatório de estoque" subtitle="Estoque baixo, valor estimado, consumo por OS e lista exportável de peças." actions={<Link className="btn btn-outline-secondary" to="/reports/executive">Dashboard executivo</Link>} />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Card className="border-0 shadow-sm mb-4"><Card.Body><Row className="g-3 align-items-end"><Col md={2}><Form.Label>Data inicial</Form.Label><Form.Control type="date" value={filters.start_date} onChange={(e)=>setFilters({...filters,start_date:e.target.value})}/></Col><Col md={2}><Form.Label>Data final</Form.Label><Form.Control type="date" value={filters.end_date} onChange={(e)=>setFilters({...filters,end_date:e.target.value})}/></Col><Col md={3}><Form.Label>Busca</Form.Label><Form.Control value={filters.search} placeholder="SKU, peça ou marca" onChange={(e)=>setFilters({...filters,search:e.target.value})}/></Col><Col md={3}><Form.Label>Estoque</Form.Label><Form.Select value={filters.low_stock} onChange={(e)=>setFilters({...filters,low_stock:e.target.value})}><option value="">Todos</option><option value="1">Somente baixo estoque</option></Form.Select></Col><Col md="auto"><Button onClick={load} disabled={loading}>{loading?"Filtrando...":"Filtrar"}</Button></Col><Col md="auto"><Button variant="outline-success" onClick={exportCsv}>Exportar CSV</Button></Col></Row></Card.Body></Card>
    <Row className="g-3 mb-4"><Kpi label="Peças ativas" value={s.active_parts || 0}/><Kpi label="Baixo estoque" value={s.low_stock_parts || 0}/><Kpi label="Sem estoque" value={s.out_of_stock_parts || 0}/><Kpi label="Valor em estoque" value={money(s.stock_value)}/><Kpi label="Entradas no período" value={s.purchase_movements || 0}/><Kpi label="Consumos no período" value={s.consumption_movements || 0}/><Kpi label="Qtd. consumida" value={s.consumed_quantity || 0}/></Row>
    <Row className="g-3 mb-4"><Col lg={6}><Card className="border-0 shadow-sm h-100"><Card.Header className="bg-white fw-semibold">Peças mais consumidas</Card.Header><Card.Body>{(data?.top_consumed_parts||[]).length===0?<EmptyState text="Sem consumo no período."/>:(data?.top_consumed_parts||[]).map((row)=><div className="d-flex justify-content-between border-bottom py-2" key={row.part_id}><span><strong>{row.part__name}</strong><div className="small text-muted">{row.part__sku}</div></span><span>{Math.abs(Number(row.quantity || 0))}</span></div>)}</Card.Body></Card></Col><Col lg={6}><Card className="border-0 shadow-sm h-100"><Card.Header className="bg-white fw-semibold">Baixo estoque</Card.Header><Card.Body>{(data?.low_stock_parts||[]).length===0?<EmptyState text="Nenhuma peça em baixo estoque."/>:(data?.low_stock_parts||[]).map((part)=><div className="d-flex justify-content-between border-bottom py-2" key={part.id}><span><strong>{part.name}</strong><div className="small text-muted">{part.sku}</div></span><Badge bg="danger">{part.stock_quantity} {part.unit}</Badge></div>)}</Card.Body></Card></Col></Row>
    <Card className="border-0 shadow-sm"><Card.Header className="bg-white fw-semibold">Peças</Card.Header><Card.Body className="p-0">{(data?.rows||[]).length===0?<EmptyState text="Nenhuma peça encontrada."/>:<Table responsive hover className="mb-0"><thead><tr><th>SKU</th><th>Peça</th><th>Categoria</th><th>Marca</th><th>Estoque</th><th>Mínimo</th><th>Custo</th><th>Venda</th><th>Valor estoque</th><th>Status</th></tr></thead><tbody>{data.rows.map((part)=><tr key={part.id}><td className="fw-semibold">{part.sku}</td><td>{part.name}</td><td>{part.category_name||"-"}</td><td>{part.brand||"-"}</td><td>{part.stock_quantity} {part.unit}</td><td>{part.minimum_stock}</td><td>{money(part.cost_price)}</td><td>{money(part.sale_price)}</td><td>{money(part.stock_value)}</td><td>{part.is_low_stock?<Badge bg="danger">Baixo</Badge>:<Badge bg="success">OK</Badge>}</td></tr>)}</tbody></Table>}</Card.Body></Card>
  </>;
}
