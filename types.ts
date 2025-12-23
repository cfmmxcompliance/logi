export enum ShipmentStatus {
  PLANNED = 'Planned',
  BOOKED = 'Booked',
  IN_TRANSIT = 'In Transit',
  CUSTOMS = 'Customs',
  RELEASED = 'Released',
  DELIVERED = 'Delivered'
}

export enum DocType {
  INVOICE_IMPORT = 'Invoice Import',
  INVOICE_EXPORT = 'Invoice Export',
  PACKING_LIST = 'Packing List',
  PEDIMENTO = 'Pedimento',
  PRE_ALERT = 'Pre-Alert'
}

export enum UserRole {
  ADMIN = 'Admin',       // Full access: Delete, Manage Users, Edit
  EDITOR = 'Editor',     // Write access: Create, Edit, No Delete
  VIEWER = 'Viewer'      // Read only
}

export interface User {
  username: string;
  name: string;
  role: UserRole;
  avatarInitials: string;
}

export interface Supplier {
  id: string;
  name: string;
  type: 'Forwarder' | 'Carrier' | 'Broker' | 'Material Vendor' | 'Other';
  contactName: string;
  email: string;
  phone: string;
  country: string;
  taxId?: string; // RFC / Tax ID
  status: 'Active' | 'Inactive';
}

export interface RawMaterialPart {
  id: string;
  REGIMEN: string;
  PART_NUMBER: string;
  TypeMaterial: string;
  DESCRIPTION_EN: string;
  DESCRIPCION_ES: string;
  UMC: string;
  UMT: string;
  HTSMX: string;
  HTSMXBASE: string;
  HTSMXNICO: string;
  IGI_DUTY: number;
  PROSEC: string;
  R8: string;
  DESCRIPCION_R8: string;
  RRYNA_NON_DUTY_REQUIREMENTS: string;
  REMARKS: string;
  NETWEIGHT: number;
  IMPORTED_OR_NOT: boolean;
  SENSIBLE: boolean;
  HTS_SerialNo: string;
  CLAVESAT: string;
  DESCRIPCION_CN: string;
  MATERIAL_CN: string;
  MATERIAL_EN: string;
  FUNCTION_CN: string;
  FUNCTION_EN: string;
  COMPANY: string;
  UPDATE_TIME: string;
}

export interface Shipment {
  id: string;
  status: ShipmentStatus;
  costs: number; 
  origin: string; 
  destination: string; 
  projectSection: string;
  shipmentBatch: string;
  personInCharge: string;
  locationOfGoods: string;
  cargoReadyDate: string;
  containerTypeQty: string;
  submissionDeadline: string;
  submissionStatus: string;
  bpmShipmentNo: string;
  carrier: string;
  portTerminal: string;
  forwarderId: string;
  blNo: string;
  etd: string;
  atd?: string;
  eta: string;
  ata?: string;
  ataCfm?: string;
  reference: string;
  containers: string[];
}

export interface VesselTrackingRecord {
  id: string;
  refNo: string;
  modelCode: string;
  qty: number;
  projectType: string;
  contractNo: string;
  invoiceNo: string;
  shippingCompany: string;
  terminal: string;
  blNo: string;
  containerNo: string;
  containerSize: string;
  etd: string;
  etaPort: string;
  preAlertDate: string;
  atd: string;
  ataPort: string;
}

export interface EquipmentTrackingRecord {
  id: string;
  projectSection: string;
  shipmentBatch: string;
  personInCharge: string;
  unloadingLocation: string;
  unloadingParty: string;
  unloadingTools: string;
  status: string;
  containerSize: string;
  containerQty: number;
  containerNo: string;
  blNo: string;
  etd: string;
  atd: string;
  etaPort: string;
}

export interface CustomsClearanceRecord {
  id: string;
  blNo: string;
  containerNo: string;
  ataPort: string;
  pedimentoNo: string;
  proformaRevisionBy: string;
  targetReviewDate: string;
  proformaSentDate: string;
  pedimentoAuthorizedDate: string;
  peceRequestDate: string;
  peceAuthDate: string;
  pedimentoPaymentDate: string;
  truckAppointmentDate: string;
  ataFactory: string;
  eirDate: string;
}

export interface PreAlertRecord {
  id: string;
  model: string;
  shippingMode: 'SEA' | 'AIR';
  bookingAbw: string;
  etd: string;
  atd?: string;
  departureCity: string;
  eta: string;
  ata?: string;
  ataFactory?: string;
  arrivalCity: string;
  invoiceNo: string;
  processed: boolean;
  linkedContainers?: string[];
}

export interface CostRecord {
  id: string;
  shipmentId: string;
  type: 'Freight' | 'Customs' | 'Transport' | 'Handling' | 'Other';
  amount: number;
  currency: 'USD' | 'MXN' | 'CNY';
  provider: string;
  description: string;
  date: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user: string;
}

export interface RestorePoint {
  id: string;
  timestamp: string;
  reason: string;
  data: any;
  sizeKB: number;
}

export enum DataStageRecordType {
  HEADER = '501',
  TRANSPORT = '502',
  INVOICE = '505',
  ITEM = '551',
  TAXES = '510',
}

export interface GeneralData {
  patente: string;
  pedimento: string;
  seccion: string;
  tipoOperacion: string;
  claveDocumento: string;
  rfc: string;
  tipoCambio: number;
  fletes: number;
  seguros: number;
  embalajes: number;
  otrosIncrementables: number;
  pesoBruto: number;
  fechaPago: string;
}

export interface DSInvoiceData {
  patente: string;
  pedimento: string;
  seccion: string;
  fechaFacturacion: string;
  numeroFactura: string;
  termFacturacion: string;
  moneda: string;
  valorDolares: number;
  valorMonedaExtranjera: number;
  proveedor: string;
  proveedorCalle: string;
}

export interface DSItemData {
  patente: string;
  pedimento: string;
  seccion: string;
  fraccion: string;
  secuencia: string;
  descripcion: string;
  precioUnitario: number;
  valorAduana: number;
  valorComercial: number;
  valorDolares: number;
  cantidadComercial: number;
  unidadMedidaComercial: string;
}

export interface PedimentoRecord extends GeneralData {
  id: string;
  items: DSItemData[];
  invoices: DSInvoiceData[];
  totalTaxes?: number;
  totalValueUsd: number;
}

export interface RawFileParsed {
  fileName: string;
  code: string;
  rows: string[][];
}

export interface DSProcessingStats {
  filesProcessed: number;
  pedimentosCount: number;
  itemsCount: number;
  invoicesCount: number;
}

export interface DataStageReport {
  id: string;
  name: string;
  timestamp: string;
  records: PedimentoRecord[];
  rawFiles: RawFileParsed[];
  stats: DSProcessingStats;
}

export interface DataStageSession {
  records: PedimentoRecord[];
  rawFiles: RawFileParsed[];
  fileName: string;
  timestamp: string;
}