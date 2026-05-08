import React from "react";
import { Table } from "react-bootstrap";
import EmptyState from "./EmptyState";

export default function DataTable({ columns, rows, rowKey = "id", emptyMessage = "Nenhum registro encontrado.", className = "" }) {
  const items = rows || [];
  if (!items.length) return <EmptyState message={emptyMessage} />;
  return (
    <Table responsive hover className={`mb-0 data-table ${className}`.trim()}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key || column.header} className={column.className || ""}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((row, index) => (
          <tr key={typeof rowKey === "function" ? rowKey(row) : row[rowKey] || index}>
            {columns.map((column) => (
              <td key={column.key || column.header} className={column.cellClassName || column.className || ""}>
                {typeof column.render === "function" ? column.render(row, index) : row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
