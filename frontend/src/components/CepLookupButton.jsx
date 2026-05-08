import React, { useState } from "react";
import { Button } from "react-bootstrap";
import { lookupCep } from "../utils/cep";

export default function CepLookupButton({ cep, onFound, onError, className = "w-100" }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const address = await lookupCep(cep);
      onFound(address);
    } catch (error) {
      onError?.(error.message || "Não foi possível buscar o CEP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline-secondary" className={className} onClick={handleClick} disabled={loading}>
      {loading ? "Buscando..." : "Buscar CEP"}
    </Button>
  );
}
