export interface PricingModel {
  id?: string; // Auto-generated hash or sequential
  modelo: string; // E.g., CM1000UZ-8
  contratos?: string; // Can be multiline string of contracts
  colores?: string; // Can be multiline string of colors
  importPriceCkd?: number;
  addValue?: number;
  fobPriceMx?: number;
  usaImportPrice?: number;
  createdAt?: string;
  updatedAt?: string;
}
