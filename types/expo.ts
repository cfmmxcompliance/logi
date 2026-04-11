export interface ExpoModel {
  // 1. Datos Base y Logísticos
  expo: string;
  modelo: string;
  pesoNetoUnitarioKg: number;
  pesoBrutoUnitarioKg: number;
  pesoBrutoUnitarioLb: number;
  pesoNetoUnitarioLb: number;
  volumenUnitario: number;
  valorUsdUnitario: number;
  ValAcero?: number;
  pesoAcero?: number;           // "Peso unit Net / Gross Acero" del CSV

  // 2. Datos de Impuestos y Facturación (SAT / CFDI)
  objetoImpuestoSat?: string;
  unidadMedidaSat?: string;
  usoCfdiSat?: string;
  claveProductoSat?: string;

  // 3. Datos Aduanales y de Importación/Exportación
  fraccionArancelaria?: string;
  HTSUS?: string;
  unidadAduana?: string;
  cantidadAduana?: number;
  puAduana?: number;
  clavePedimento?: string;
  incoterm?: string;

  // 4. Regulaciones de Transporte (Complemento Carta Porte)
  materialPeligroso?: boolean;
  claveMaterialPeligroso?: string;
  tipoDeMateria?: string;

  // 5. Regulaciones de Fabricante y EPA
  mid?: string;
  testGroupNameNo?: string;

  createdAt?: string;
  updatedAt?: string;
}
