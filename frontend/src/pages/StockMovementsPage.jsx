import React, { useEffect, useState } from "react";
import { Card, Table } from "react-bootstrap";
import api, { apiError, results } from "../api/client";
import AreaTabs from "../components/AreaTabs";
import EmptyState from "../components/EmptyState";
import ErrorAlert from "../components/ErrorAlert";
import PageHeader from "../components/PageHeader";
import { money } from "../workshopOptions";

export default function StockMovementsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setItems(results((await api.get("/workshop/stock-movements/")).data));
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => { load(); }, []);

  return <>
    <PageHeader title="Movimentos de estoque" subtitle="Entradas, ajustes, estornos e consumo automático por OS." />
    <AreaTabs area="stock" />
    <ErrorAlert error={error} onClose={() => setError("")} />
    <Card className="border-0 shadow-sm">
      <Card.Body className="p-0">
        {items.length === 0 ? <EmptyState /> : <Table responsive hover className="mb-0">
          <thead><tr><th>Data</th><th>Peça</th><th>Tipo</th><th>Qtd</th><th>Custo</th><th>OS</th><th>Usuário</th><th>Notas</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td>{new Date(item.created_at).toLocaleString("pt-BR")}</td>
            <td>{item.part_name}</td>
            <td>{item.movement_type}</td>
            <td>{item.quantity}</td>
            <td>{money(item.unit_cost)}</td>
            <td>{item.work_order_number || "-"}</td>
            <td>{item.actor_name || "-"}</td>
            <td>{item.notes || "-"}</td>
          </tr>)}</tbody>
        </Table>}
      </Card.Body>
    </Card>
  </>;
}
