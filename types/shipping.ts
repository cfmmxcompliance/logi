export interface ShippingModel {
  id?: string; // Auto-generated or custom (usually invoiceNo)
  cfpOrder?: string;
  cfcOrder?: string;
  issue?: string;
  cfpContractNo?: string;
  cfcContractNo?: string;
  invoiceNo: string; // Primary tracking identifier
  modelo?: string;
  color?: string;
  qty?: number;
  truck?: string;
  productNo?: string;
  destination?: string;
  epa?: string;
  productionDate?: string;
  loadingDate?: string;
  etd?: string;
  etaToDoor?: string;
  trailerNo?: string;
  carrier?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}
