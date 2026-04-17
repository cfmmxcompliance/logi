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
  AGENT = 'Agent',       // External Agent: Master Data view only
  OPERATOR = 'Operator', // Same as Editor (User requested alias)
  CONTROLLER = 'Controller', // Finance & Expense Control
  EXPO = 'Expo',         // Exporter partner
  CARRIER = 'Carrier',   // Transport/Shipping partner
  VIEWER = 'Viewer',      // Read only
  PENDING = 'Pending',    // Default for new signups
  HANDHELD_USER = 'Handheld User', // Operario de piso con scanner (Sello)
  HANDHELD_USER2 = 'Handheld User 2', // Operario de piso con scanner (Liberacion)
  EMBARQUES = 'Embarques', // Equipo encargado de control de embarques
  CLIENT = 'Cliente',    // Read-only access: Asignación Diaria de Cajas Secas 53' only
}

export interface User {
  username: string;
  email?: string; // Essential for DB updates
  name: string;
  role: UserRole;
  avatarInitials: string;
}

export interface Quotation {
  id: string;
  concept: string; // Service name (must match CostRecord.comments for validation)
  price: number;   // Unit Price or Total (User defined)
  currency: 'USD' | 'MXN';
  lastUpdated: string;
  validForContainerCount?: number; // Optional: Restrict quote to specific container count (e.g. 1 vs 2)
}

export interface Supplier {
  id: string;
  name: string;
  type: 'Forwarder' | 'Carrier' | 'Broker' | 'Material Vendor' | 'Other';
  contactName: string;
  email: string;
  phone: string;
  country: string;
  rfc?: string; // Mexican Tax ID
  taxId?: string; // Other Tax ID
  validationStatus?: 'compliant' | 'warning' | 'blacklisted' | 'unchecked';
  status: 'Active' | 'Inactive';
  quotations?: Quotation[]; // New Field for Cost Validation
  updatedAt?: string;
}

export interface RawMaterialPart {
  id: string;
  REGIMEN: string;
  PART_NUMBER: string;
  TypeMaterial: string | number;
  DESCRIPTION_EN: string;
  DESCRIPCION_ES: string;
  UMC: string;
  UMT: string;
  HTSMX: string; // Fraccion
  HTSMXBASE: string | number; // HTS
  HTSMXNICO: string; // Nico
  IGI_DUTY: string | number;
  PROSEC: string | number;
  R8: string;
  DESCRIPCION_R8: string;
  RRYNA_NON_DUTY_REQUIREMENTS: string;
  REMARKS: string | number;
  NETWEIGHT: number;
  IMPORTED_OR_NOT: string; // "Y" or "N"
  SENSIBLE: string; // "NO" or "YES"
  HTS_SerialNo: string | number;
  CLAVESAT: string | number;
  DESCRIPCION_CN: string;
  MATERIAL_CN: string;
  MATERIAL_EN: string;
  FUNCTION_CN: string;
  FUNCTION_EN: string;
  COMPANY: string;
  ESTIMATED: number; // Value > 0 implies "Estimated Price" exists
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
  updatedAt?: string;
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
  updatedAt?: string;
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
  updatedAt?: string;
}

export interface SparePartsTrackingRecord {
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
  updatedAt?: string;
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
  clavePedimento?: string; // New: E.g. A1, V1
  assignedSpecialist?: string; // New: Selected in PreAlerts
  updatedAt?: string;
}

export interface DigitalArchiveRecord extends PedimentoRecord {
  docId: string;    // Matches the document ID or Filename
  uploadDate: string;
  pdfUrl?: string;  // If uploaded to storage
  status: 'DRAFT' | 'PROCESSED';
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
  packages?: number;
  grossWeight?: number;
  linkedContainers?: string[];
  assignedSpecialist?: string; // New: Added via PreAlert Extraction
  updatedAt?: string;
}

export interface CostRecord {
  id: string;
  shipmentId: string;
  type: 'Freight' | 'Customs' | 'Transport' | 'Handling' | 'Other' | 'PREPAYMENTS' | 'INLAND' | 'BROKER' | 'AIR';
  amount: number;
  currency: 'USD' | 'MXN' | 'CNY';
  provider: string;
  description: string;
  date: string;
  status: 'Pending' | 'Paid' | 'Scheduled';
  paymentDate?: string;
  invoiceNo?: string; // New: For Controller View
  uuid?: string;      // New: SAT UUID
  comments?: string;  // New: Remarks
  linkedContainer?: string; // New: Specific container for this cost
  xmlFile?: string;   // File name for XML
  pdfFile?: string;   // File name for PDF
  xmlUrl?: string;    // Storage URL (or Base64 for now if small)
  pdfUrl?: string;    // Storage URL (Omit for now if too large, use mock)
  xmlDriveId?: string; // Google Drive File ID for deletion
  pdfDriveId?: string; // Google Drive File ID for deletion
  isVirtual?: boolean; // For transient UI rows
  extractedBl?: string; // Validated BL found in file
  extractedContainer?: string; // Validated Container found in file
  bpm?: string; // Optional BPM Number (Manual or Linked)
  aaRef?: string; // New: AA Reference (Only for BROKER)
  submitDate?: string; // New: Date when BPM was assigned
  updatedAt?: string;
  xmlItems?: {
    description: string;
    quantity: number;
    unit: string;
    unitValue: number;
    amount: number;
    claveProdServ: string;
    claveUnidad: string;
  }[];
  taxDetails?: {
    totalTransferred: number;
    totalRetained: number;
  };
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user: string;
}

export interface DailyChange {
  id: string;
  timestamp: string;
  action: 'UPDATE' | 'UPSERT' | 'DELETE';
  user: string;
  partNumbers: string[]; // List of affected part numbers
  count: number;
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
  COVE_ASSOCIATION = '506',
  DIGITALIZED_DOC = '520',
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
  fechaEntrada: string; // New: Extracted Entry Date
  clavePedimento?: string; // New: Extracted Key (A1, V1)
  ivaPrv?: number; // New: Extracted IVA on PRV
  cnt?: number; // New: Extracted CNT
  igiTotal?: number; // New: Extracted IGI (Total)
  lineaCaptura?: string; // New: Extracted Alphanumeric Capture Line
  isFixedAsset?: boolean; // New: Activo Fijo flag
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
  cantidadTarifa: number;
  unidadMedidaTarifa: string;
  paisVendedor: string;
  paisOrigen: string;
  nico: string;
  vinculacion: string;
  metodoValoracion: string;
  valorAgregado?: number;
  contribuciones?: {
    clave: string;
    tasa: number;
    tipoTasa: string;
    formaPago: string;
    importe: number;
  }[];
  observaciones?: string;
  partNumber?: string;
  invoiceNo?: string;
}

export interface DSCoveData {
  patente: string;
  pedimento: string;
  seccion: string;
  numeroFactura: string;
  cove: string;
}

export interface DSDigitalizedData {
  patente: string;
  pedimento: string;
  seccion: string;
  eDocument: string;
}

export interface PedimentoRecord extends GeneralData {
  id: string; // Internal UUID
  items: DSItemData[];
  invoices: DSInvoiceData[];
  coves: DSCoveData[];
  digitalDocuments: DSDigitalizedData[];
  referencias?: string; // Extracted references (e.g. BL, Containers)
  totalTaxes?: number;
  valorAduanaTotal?: number;
  dtaTotal?: number;
  prevalidacionTotal?: number;
  cntTotal?: number;
  igiTotal?: number;
  ivaPrvTotal?: number;
  lineaCaptura?: string;
  isFixedAsset?: boolean;
  totalValueUsd: number;
}

export interface CCPItem {
  id: string;
  containerNo: string;
  satCode: string;
  description: string;
  quantity: number;
  unit: string;
  hazardousMaterial: string;
  weight: number;
  value: number;
  currency: string;
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
  storageUrl?: string;
}

export interface DataStageSession {
  records: PedimentoRecord[];
  rawFiles: RawFileParsed[];
  fileName: string;
  timestamp: string;
}

export interface CommercialInvoiceItem {
  id: string;
  invoiceNo: string;
  date: string;
  item: string;
  model: string;
  partNo: string;
  englishName?: string;
  spanishDescription?: string;
  hts?: string;
  prosec?: string;
  rb?: string;
  qty: number;
  um?: string;
  netWeight?: number;
  unitPrice: number;
  totalAmount: number;
  regimen?: string;
  containerNo?: string;
  incoterm?: string;
  currency?: string;
  priceVerified?: boolean;
  // Custom CFDI Fields
  vin?: string;
  engine?: string;
  pesoNetokg?: number;
  pesoBrutokg?: number;
  valAgregado?: number;
  unidad?: string;
  rawDescripcion?: string;
  uuid?: string;
  // Metadata for consolidation
  vendorName?: string;
  vendorRfc?: string;
  vendorAddress?: string;
}

export interface XMLCIRecord {
  id: string; // Same as UUID or InvoiceNo-FiscalID
  idFiscal: string;
  nombre: string;
  domicilio: string;
  vinculacion: string; // "SI" or "NO"
  invoiceNo: string;
  fecha: string; // YYYY-MM-DD
  incoterm: string;
  moneda: string;
  valMonFact: number;
  factorMoneda: number;
  valDolares: number;
  uuid: string;
  updatedAt?: string;
}

export interface MasterDataReport {
  id: string; // Date (YYYY-MM-DD)
  timestamp: string;
  fullCsvUrl?: string; // Drive Link
  changesCsvUrl?: string; // Drive Link
  fullDriveId?: string;
  changesDriveId?: string;
  itemsAffected: number;
}

// Audit Module Interfaces
export interface AuditDiscrepancy {
  id: string;
  pedimentoId: string;
  itemSecuencia: string;
  invoiceNo: string;
  partNumber: string;
  description: string;
  type: 'QUANTITY' | 'VALUE_USD' | 'UNIT_PRICE' | 'PART_NUMBER' | 'MISSING_IN_PEDIMENTO' | 'MISSING_IN_INVOICE';
  pedimentoValue: string | number;
  invoiceValue: string | number;
  difference: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
}

export interface AuditReport {
  id: string;
  date: string;
  pedimentoId: string;
  totalDiscrepancies: number;
  totalValueStats: {
    pedimentoTotal: number;
    invoiceTotal: number;
    difference: number;
  };
  discrepancies: AuditDiscrepancy[];
}

export interface StorageState {
  parts: RawMaterialPart[];
  shipments: Shipment[];
  vesselTracking: VesselTrackingRecord[];
  equipmentTracking: EquipmentTrackingRecord[];
  sparePartsTracking?: SparePartsTrackingRecord[];
  customsClearance: CustomsClearanceRecord[];
  preAlerts: PreAlertRecord[];
  costs: CostRecord[];
  logs: AuditLog[];
  snapshots: RestorePoint[];
  logistics: any[]; // Legacy/Undefined
  suppliers: Supplier[];
  dataStageReports: DataStageReport[];
  trainingSubmissions: any[];
  commercialInvoices: CommercialInvoiceItem[];
  cfdiInvoices?: CommercialInvoiceItem[]; // Isolated XML Extraction Collection
  digitalArchive?: DigitalArchiveRecord[]; // New: Unpaid Pedimentos
  dailyChanges: DailyChange[];
  dailyReports?: MasterDataReport[];
  users: User[];
  xmlCI?: XMLCIRecord[];
  fianzas?: FianzaRecord[];
}

export interface SelloRecord {
  id?: string;
  fechaAsignacion: string; // YYYY-MM-DD
  asignacionCajaId: string;
  numeroCaja: string;
  selloAsignado: string;
  usuario: string; // email of the user who assigned it
  fechaHoraRegistro?: string; // Local time string for easy reading in DB
  fotoUrl?: string; // URL of the photo for auditing
  fotoBase64?: string; // Compressed image saved directly into the database
  createdAt?: string;
}

export interface LiberacionRecord {
  id?: string;
  fechaLiberacion: string; // YYYY-MM-DD
  asignacionCajaId: string;
  numeroCaja: string;
  selloValidado: string;
  coincideConOriginal: boolean;
  usuario: string; // email of the user who closed the box
  fechaHoraRegistro?: string; // Local time string
  fotos: {
    cajaUrl?: string; // URL in Google Drive
    puertasUrl?: string; // URL in Google Drive
    selloUrl?: string; // URL in Google Drive
  };
  createdAt?: string;
}

export interface BPMRecord {
  id?: string;
  ref_no?: string | number;
  part_no: string;
  description_cn?: string;
  description_en?: string;
  material_cn?: string;
  material_en?: string;
  function_cn?: string;
  function_en?: string;
  net_weight?: number;
  imported_or_not?: string;
  rrynas?: string;
  remarks?: string;
  certification?: string;
  spanish_description?: string;
  um?: string;
  hts?: string;
  prosec?: string;
  r8?: string;
  regimen?: string;
  sensible?: string;
  igi?: string | number;
  clavesat?: string | number;
  
  // MasterData explicit mappings not originally in BPM
  type_material?: string | number;
  hts_base?: string | number;
  hts_nico?: string;
  descripcion_r8?: string;
  company?: string;
  hts_serial_no?: string | number;
  umc?: string;
  umt?: string;

  // Auditing and Operations
  folio_seguimiento?: string; // Example: LMHTS202604040001
  secuencia_lote?: string; // Example: "1 of 50"
  subidoPor?: string; // Email of the user who uploaded
  fechaSubida?: string; // ISO date string
  aprobadoPor?: string; // Email of checking user
  fechaAprobacion?: string; // ISO date string
  fotoUrl?: string; // Legacy single Google drive link
  fotoUrls?: string[]; // Array of multiple Google Drive URLs
}export * from './types/fianza';
