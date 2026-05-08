import React from "react";
export default function EmptyState({ text = "Nenhum registro encontrado." }) {
  return <div className="text-center text-muted border rounded bg-white py-5">{text}</div>;
}
