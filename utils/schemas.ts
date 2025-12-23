// Mapeo de campos según Anexo 22 / Manual Técnico de Data Stage (Registros M3)

export const DATA_STAGE_SCHEMAS: Record<string, string[]> = {
  // 501 - Datos Generales
  '501': [
    'Patente', 'Pedimento', 'Sección', 'Tipo Operación', 'Clave Doc', 'Fecha Entrada', 
    'Fecha Present.', 'RFC', 'CURP', 'Tipo Cambio', 'Fletes', 'Seguros', 'Embalajes', 
    'Otros Incr.', 'Deducibles', 'Peso Bruto', 'Medio Transp.', 'Medio Arr.', 'Medio Sal.', 
    'Valor USD', 'Valor Aduana', 'Valor Com.', 'Origen/Destino', 'Descargo', 'Ult. Partida', 
    'Nom. Imp/Exp', 'Calle', 'No. Ext', 'No. Int', 'CP', 'Ciudad', 'Entidad', 'Pais', 'Fecha Pago'
  ],

  // 502 - Transporte
  '502': [
    'Patente', 'Pedimento', 'Sección', 'RFC Transp.', 'CURP Transp.', 'Nombre Transportista', 
    'País', 'ID Transporte', 'Domicilio Fiscal', 'Ciudad', 'Estado'
  ],

  // 503 - Guías
  '503': [
    'Patente', 'Pedimento', 'Sección', 'Tipo Guía', 'No. Guía'
  ],

  // 504 - Contenedores
  '504': [
    'Patente', 'Pedimento', 'Sección', 'No. Contenedor', 'Tipo Contenedor'
  ],

  // 505 - Facturas
  '505': [
    'Patente', 'Pedimento', 'Sección', 'Fecha Fact.', 'No. Factura', 'Incoterm', 'Moneda', 
    'Valor USD', 'Valor Mon. Ext.', 'País Fact.', 'Entidad Fed.', 'ID Fiscal Prov.', 
    'Proveedor', 'Calle', 'No. Ext', 'No. Int', 'Ciudad', 'Municipio', 'CP', 'País Prov.'
  ],

  // 506 - Fechas
  '506': [
    'Patente', 'Pedimento', 'Sección', 'Tipo Fecha', 'Fecha'
  ],

  // 507 - Casos (Identificadores a nivel pedimento)
  '507': [
    'Patente', 'Pedimento', 'Sección', 'Clave Identif.', 'Complemento 1', 'Complemento 2', 'Complemento 3'
  ],

  // 509 - Tasas a Nivel Pedimento (Información adicional, no cobro directo a veces)
  '509': [
    'Patente', 'Pedimento', 'Sección', 'Contribución', 'Tasa', 'Tipo Tasa'
  ],

  // 510 - Contribuciones (Nivel Pedimento - Cobro)
  '510': [
    'Patente', 'Pedimento', 'Sección', 'Contribución', 'Forma Pago', 'Importe'
  ],

  // 511 - Observaciones
  '511': [
    'Patente', 'Pedimento', 'Sección', 'Observaciones'
  ],

  // 551 - Partidas
  '551': [
    'Patente', 'Pedimento', 'Sección', 'Fracción', 'Secuencia', 'Subdiv.', 'Descripción', 
    'Precio Unit.', 'Valor Aduana', 'Valor Com.', 'Valor USD', 'Cant. Com.', 'UMC', 
    'Cant. Tarifa', 'UMT', 'País Vendedor', 'País Origen', 'País Comp.', 'Obs.'
  ],

  // 553 - Permisos (Partidas)
  '553': [
    'Patente', 'Pedimento', 'Sección', 'Fracción', 'Secuencia', 'Clave Permiso', 
    'Firma Descargo', 'No. Permiso', 'Valor Com.', 'Cantidad'
  ],

  // 554 - Identificadores (Partidas)
  '554': [
    'Patente', 'Pedimento', 'Sección', 'Fracción', 'Secuencia', 'Clave Identif.', 
    'Caso', 'Complemento 1', 'Complemento 2', 'Complemento 3'
  ],

  // 556 - Contribuciones (Partidas)
  '556': [
    'Patente', 'Pedimento', 'Sección', 'Fracción', 'Secuencia', 'Contribución', 
    'Forma Pago', 'Importe', 'Tipo Tasa', 'Tasa'
  ],

  // 557 - Observaciones (Partidas)
  '557': [
    'Patente', 'Pedimento', 'Sección', 'Fracción', 'Secuencia', 'Observaciones'
  ],
  
  // 701 - Rectificaciones (Encabezado)
  '701': [
     'Patente Original', 'Pedimento Original', 'Sección Original', 'Clave Doc Orig.', 'Fecha Pago Orig.',
     'Patente Rect.', 'Pedimento Rect.', 'Sección Rect.', 'Clave Doc Rect.', 'Fecha Pago Rect.'
  ]
};

export const RECORD_DESCRIPTIONS: Record<string, string> = {
    '501': 'Datos Generales',
    '502': 'Transporte',
    '503': 'Guías',
    '504': 'Contenedores',
    '505': 'Facturas',
    '506': 'Fechas',
    '507': 'Casos (Identificadores)',
    '508': 'Cuentas Aduaneras',
    '509': 'Tasas (Info)',
    '510': 'Contribuciones Globales',
    '511': 'Observaciones',
    '512': 'Descargos',
    '520': 'Destinatarios',
    '551': 'Partidas (Mercancías)',
    '553': 'Permisos (Partida)',
    '554': 'Identificadores (Partida)',
    '556': 'Contribuciones (Partida)',
    '557': 'Observaciones (Partida)',
    '558': 'Regulaciones y Restricciones',
    '701': 'Rectificaciones',
};