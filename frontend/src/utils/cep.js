import { onlyDigits, maskCep } from "../workshopOptions";

export async function lookupCep(cep) {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) {
    throw new Error("Informe um CEP com 8 dígitos antes de buscar.");
  }
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) {
    throw new Error("Não foi possível consultar o CEP. Tente novamente.");
  }
  const data = await response.json();
  if (data.erro) {
    throw new Error("CEP não encontrado na base pública ViaCEP.");
  }
  return {
    zip_code: maskCep(data.cep || digits),
    address_line: data.logradouro || "",
    district: data.bairro || "",
    city: data.localidade || "",
    state: data.uf || "",
    country: "Brasil",
  };
}
