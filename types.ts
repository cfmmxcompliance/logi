import { FianzaRecord } from './types/fianza';

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
  EXPO_ANALIST = 'Expo Analist', // Exporter Analyst
  EXPO_COORDINATOR = 'Expo Coordinator', // Exporter Coordinator
  CARRIER = 'Carrier',   // Transport/Shipping partner (filtered by SCAC)
  TRANSPORTISTA = 'Transportista', // Sub-línea partner (filtered by nombreSubLinea)
  VIEWER = 'Viewer',      // Read only
  PENDING = 'Pending',    // Default for new signups
  HANDHELD_USER = 'Handheld User', // Operario de piso con scanner (Sello)
  HANDHELD_USER2 = 'Handheld User 2', // Operario de piso con scanner (Liberacion)
  HANDHELD_AF = 'Handheld AF', // Operario para auditoría de Activo Fijo
  EMBARQUES = 'Embarques', // Equipo encargado de control de embarques
  CLIENT = 'Cliente',    // Read-only access: Asignación Diaria de Cajas Secas 53' only
  FINANZAS = 'Finanzas', // Read-only access: Saldo Fianza module only
  ANALISTA_CUMPLIMIENTO = 'Analista Cumplimiento', // Solo acceso a módulos de cumplimiento
  PROVEEDOR = 'Proveedor',   // Supplier self-service portal
}

export interface User {
  username: string;
  email?: string; // Essential for DB updates
  name: string;
  role: UserRole;
  avatarInitials: string;
  scac?: string;    // Carrier SCAC code (for CARRIER role filtering)
  subLinea?: string; // Sub-line name (for TRANSPORTISTA role filtering)
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
  assignedSpecialist?: string;
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
  assignedSpecialist?: string;
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
  assignedSpecialist?: string;
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

export interface FixedAsset {
  id: string;
  mbl: string;
  containerNumber: string;
  pedimento: string;
  date: string;
  clavePedimento: string;
  secuenciaPedimento: string;
  descriptionPartNumber: string;
  htsCode: string;
  qty: number | string;
  partNumber: string;
  cfmotoPartNumber: string;
  spanishDescription: string;
  englishDescription: string;
  chineseDescription: string;
  materialName: string;
  physicalBrand: string;
  physicalModel: string;
  physicalSerialNumber: string;
  photoUrl?: string; // Legacy
  photoUploadedBy?: string; // Legacy
  photoUploadedAt?: string; // Legacy
  photos?: {
    id: string;
    url: string;
    uploadedBy: string;
    uploadedAt: string;
  }[];
  pedimentoPdfUrl?: string;
  pedimentoPdfUploadedBy?: string;
  pedimentoPdfUploadedAt?: string;
  invoicePdfUrl?: string;
  invoicePdfUploadedBy?: string;
  invoicePdfUploadedAt?: string;
  exists: string;
  countryOrigin: string;
  invoice: string;
  unitPriceUsd: number | string;
  amountUsd: number | string;
  validadoDataStage: string;
  brandPedimento: string;
  modelPedimento: string;
  serialNumberPedimento: string;
  localizationPlant: string;
  trazable: string;
  physicalDigitalPedimento: string;
  physicalIdCustomsInfo: string;
  responsible: string;
  partOfProcess: string;
  warehouse: string;
  area: string;
  document: string;
  etiqueta: string;
  comments: string;
  createdAt?: string;
  updatedAt?: string;
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
  // NOTA: '506' = Fechas del pedimento (manejado explícitamente en parser.ts, NO como COVE)
  // NOTA: '520' = Destinatarios de la mercancía (manejado explícitamente en parser.ts)
  COVE_ASSOCIATION = '_COVE', // COVEs vienen de archivos con nomenclatura especial (no 5xx del formato M3)
  DIGITALIZED_DOC = '_EDIGITAL', // Documentos digitalizados — no corresponden al número 520 del SAT
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
  destinatario?: string;
  destinatarioRfc?: string;
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
  edDocuments?: number; // Count of CFDIs from 507 (ClaveCaso='ED')
  containerCount?: number; // Count of containers from 504
  containerNumbers?: string[]; // Actual container numbers from 504 for deduplication
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
  reviewsByMonth?: { name: string; Import: number; Export: number }[]; // Revisiones _Sel/_Inci
  monthlyDuties?: {                                                    // Cruce 501×510 precomputado
    year: number;                                                      // Año del reporte (ej. 2026)
    name: string;
    'IGI Import': number; 'IVA Import': number; 'IVA Import Efectivo': number; 'IVA Import Fianza': number; 'DTA Import': number;
    'IGI Export': number; 'IVA Export': number; 'DTA Export': number;
  }[];
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
  assignedSpecialist?: string;
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
  archivo?: string;  // Original filename used as reference key
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
  archivo?: string;  // Original filename reference
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

export interface Rule8th {
  id?: string;
  folio: string;
  issueDate: string; // ISO string
  expirationDate: string; // ISO string
  partNumber: string;
  description: string;
  originalTariffFraction: string;
  fraccionReglaOctava?: string;
  unidadMedida?: string;
  totalAuthorized: number;
  valorDolares?: number;
  valorDolaresEjercido?: number;
  permisoPrevio?: string;
  consumed: number;
  balance: number;
  masterdataMatch?: 'matched' | 'mismatched' | 'not_found';
  masterdataErrors?: string[];
  masterdataPartNumber?: string;
  masterdataDescription?: string;
  masterdataR8?: string;
  status: 'Vigente' | 'Vencida' | 'Agotada';
  createdAt?: string;
  updatedAt?: string;
  files?: { name: string; url: string; type: string }[];
}

export interface HistoricoExpoRecord {
  id?: string;
  trailer: string;
  idNumber?: string;
  seal?: string;
  team?: string;
  transportLine?: string;
  cfmRef: string;
  scac?: string;
  caat?: string;
  pickupDayCFM: string;
  dodaUrl?: string;
  entryUrl?: string;
  dodaUploadedAt?: string;
  entryUploadedAt?: string;
  dodaUploadHistory?: string[];
  entryUploadHistory?: string[];
  dodaApertureDate?: string;
  entryApertureDate?: string;
  dodaApertureHistory?: string[];
  entryApertureHistory?: string[];
  dateRequested: string;
  crossingDate: string;
  dateReceived: string;
  daysToReceive: number | string;
  expDoda: string;
  comments: string;
  deliveryDate?: string;
  scacAndCaat: string;
  ataDestination?: string;
  createdAt?: number | string;
}

export interface Dealer {
  id: string;       // Firestore Document ID
  idDealer: string; // The IdDealer from the Excel
  shipTo: string;   // Ship To / Name
  address?: string;
  city?: string;
  state?: string;
  zip?: string | number;
  phone?: string | number;
  country?: string;
  createdAt?: string;
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
  dealers?: Dealer[]; // New Dealers Collection
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
  fixedAssets: FixedAsset[];
  rule8ths?: Rule8th[];
  historicoExpo?: HistoricoExpoRecord[];
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
    cajaUrl?: string; // URL in Google Drive (legacy - now in LiberacionDockRecord)
    puertasUrl?: string; // URL in Google Drive (legacy)
    selloUrl?: string; // URL in Google Drive
  };
  createdAt?: string;
}

export interface LiberacionDockRecord {
  id?: string;
  fechaLiberacion: string; // YYYY-MM-DD
  asignacionCajaId: string;
  numeroCaja: string;
  usuario: string;
  fechaHoraRegistro?: string;
  fotos: {
    cajaUrl?: string;    // Foto Placas/Caja
    puertasUrl?: string; // Foto Puertas
  };
  uploadStatus?: string;
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
}

// ─── Portal de Proveedores ───────────────────────────────────────────────────

export interface StatusEvent {
  status: string;
  date: string;   // ISO string
  user: string;   // email del usuario que hizo el cambio
  notes?: string;
}

export interface VendorConcept {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  claveProdServ?: string;
  claveUnidad?: string;
}

export interface VendorInvoice {
  id: string;

  // Identidad fiscal del proveedor
  vendorRfc: string;          // RFC — clave de filtrado (patrón = user.scac en CARRIER)
  vendorName: string;

  // Datos fiscales del CFDI
  invoiceNo: string;          // Folio fiscal
  uuid: string;               // UUID SAT timbrado
  issueDate: string;          // Fecha de timbrado (YYYY-MM-DD)
  currency: 'MXN' | 'USD';
  subtotal: number;
  totalIVA: number;
  total: number;

  // Conceptos (extraídos de XML → PDF → manual)
  concepts: VendorConcept[];
  sourceMethod: 'xml' | 'pdf' | 'manual'; // Método de extracción usado

  // Archivos respaldados en Google Drive
  xmlUrl?: string;
  pdfUrl?: string;
  xmlDriveId?: string;
  pdfDriveId?: string;

  // Referencia libre del proveedor al momento de subir (pista, no validada)
  blHint?: string;

  // Vinculación oficial — se llena en la Cuenta de Gastos, validada contra shipments/pre_alerts
  expenseAccountId?: string;
  blReference?: string;
  containersReferenced?: string[];
  guiaReference?: string;

  // Flujo de aprobación — el estatus en cascada desde ExpenseAccount
  // SUBIDA → EN_REVISION → APROBADA → PAGADA  (o RECHAZADA)
  status: 'SUBIDA' | 'EN_REVISION' | 'APROBADA' | 'RECHAZADA' | 'PAGADA';
  statusHistory: StatusEvent[];

  internalNotes?: string;
  rejectionReason?: string;
  submittedAt: string;     // ISO — momento en que el proveedor envió
  reviewedAt?: string;
  reviewedBy?: string;
  paidAt?: string;         // Derivado del comprobante de pago en ExpenseAccount
}

export interface ExpenseAccount {
  id: string;
  accountNo: string;          // Auto-generado: CG-2026-0042
  description: string;

  // IDs de las vendor_invoices incluidas en esta cuenta
  vendorInvoiceIds: string[];

  // Vinculación logística por factura: invoiceId → { BL, contenedores, guía }
  invoiceLinks: {
    [invoiceId: string]: {
      blReference: string;
      containersReferenced: string[];
      guiaReference?: string;
    };
  };

  // Totales calculados del conjunto seleccionado
  totalMXN: number;
  totalUSD: number;

  // Flujo de la cuenta de gastos
  // BORRADOR → EN_REVISION → APROBADA → PAGADA
  // Transiciones de status propagan en cascada a todas las vendor_invoices vinculadas:
  //   BORRADOR    → (sin cambio en facturas, aún editando)
  //   EN_REVISION → vendor_invoices[vinculadas].status = 'EN_REVISION'
  //   APROBADA    → vendor_invoices[vinculadas].status = 'APROBADA'
  //   PAGADA      → SOLO se activa al subir el comprobante de pago PDF
  //                 El upload dispara el timestamp (patrón T.LAYOUT en TRUCK_TRACKING)
  //                 No existe botón "Marcar Pagada" — el archivo ES el evento
  status: 'BORRADOR' | 'EN_REVISION' | 'APROBADA' | 'PAGADA';
  statusHistory: StatusEvent[];

  createdAt: string;
  createdBy: string;
  submittedAt?: string;       // Auto — cuando se promueve a EN_REVISION
  submittedBy?: string;
  approvedAt?: string;        // Auto — cuando se aprueba
  approvedBy?: string;

  // Comprobante de Pago — patrón idéntico a T.LAYOUT / T.CCP en TRUCK_TRACKING
  // El upload del PDF es el único disparador del cambio a PAGADA
  paymentReceiptUrl?: string;
  paymentReceiptDriveId?: string;
  paymentReceiptUploadedAt?: string;  // Timestamp auto al momento del upload
  paymentReceiptUploadedBy?: string;  // Email del usuario que subió el comprobante

  internalNotes?: string;
}

export * from './types/fianza';

// ─── Reporteo VINs ───────────────────────────────────────────────────────────
export interface VinReportRecord {
  id?: string;
  containerNo: string;
  sealNo: string;
  model: string;
  ref: string;
  productNo: string;
  vinNo: string;
  engineNo: string;
  productionDate: string;
  color: string;
  orderNo: string;
  invoiceNo: string;
  shippingDate: string;
  plataformas: string;
}
