// types/capturaLayout.ts
// Represents a finalized aduanal layout saved from the Motor de Captura (Macro)

export interface CapturaLayoutVin {
  containerNo:     string;
  sealNo:          string;
  outDate:         string;
  vin:             string;
  engine:          string;
  modelo:          string;
  color:           string;
  productNo:       string;
  productionDate:  string;
  ref?:            string;
  remarks?:        string;
  states?:         string;
  orderNo?:        string;

  // BOM enrichment
  taric:           string;
  htsus:           string;
  valorUsd:        number;
  pesoBruto:       number;
  pesoNeto:        number;
  unidadAduana:    string;
  cantidadAduana:  number;
  clavePedimento:  string;
  incoterm:        string;
  claveProductoSat: string;
  mid:             string;
  bomFound:        boolean;

  // Validation flags
  selloMatch?:     boolean;
  asigMatch?:      boolean;
}

export interface CapturaLayout {
  id:               string;     // Firestore doc ID — same as invoiceNo
  invoiceNo:        string;
  cfpContractNo:    string;

  // Summary metrics
  totalUnits:       number;
  totalValUsd:      number;
  totalPesoBruto:   number;
  totalPesoNeto:    number;
  containers:       string[];

  // Payload
  vins:             CapturaLayoutVin[];

  // Metadata
  savedAt:          any;        // Firestore Timestamp (use serverTimestamp())
  savedBy?:         string;
  status:           'draft' | 'final' | 'enviado';
}
