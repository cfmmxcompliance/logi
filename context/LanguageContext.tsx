import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type Language = 'es' | 'en';

interface Translations {
    [key: string]: {
        es: string;
        en: string;
    };
}

export const translations: Translations = {
    // Menú Principal y Títulos Operativos
    "menu.cajas": { es: "Catálogo de Cajas Secas 53'", en: "53-foot Dry Van Catalog" },
    "menu.asignaciones": { es: "Asignación Diaria de Cajas", en: "Daily 53' Dry Van Assignment" },
    "menu.drivers": { es: "Directorio de Choferes", en: "Drivers Directory" },
    "menu.líneas": { es: "Líneas de Tracto Camión", en: "Truck Tractor Lines" },
    "menu.carriers": { es: "Catálogo de Transportistas", en: "Carriers Catalog" },
    "menu.dashboard": { es: "Dashboard", en: "Dashboard" },
    "menu.plan": { es: "Shipment Plan", en: "Shipment Plan" },
    "menu.prealerts": { es: "Pre-Alerts", en: "Pre-Alerts" },
    "menu.tracking": { es: "Tracking", en: "Tracking" },
    "menu.equipment": { es: "Equipment", en: "Equipment" },
    "menu.customs": { es: "Customs Clearance", en: "Customs Clearance" },
    "menu.ciextractor": { es: "CI Extractor", en: "CI Extractor" },
    "menu.ai": { es: "Asistente IA", en: "AI Assistant" },
    
    // Módulo de Asignaciones Diarias Específico
    "asig.title": { es: "Asignación Diaria de Cajas Secas 53'", en: "Daily 53-foot Dry Van Assignment" },
    "asig.subtitle": { es: "Gestión operativa vinculando Cajas Secas 53' y Transportistas activos.", en: "Operational management linking 53' Dry Vans and active Carriers." },
    "btn.new": { es: "Asignar", en: "Assign" },
    "btn.export": { es: "Exportar", en: "Export" },
    "btn.mass": { es: "Filtros Masivos", en: "Mass Filters" },
    "btn.actualizar": { es: "Actualizar", en: "Update" },
    "btn.actualizando": { es: "Actualizando...", en: "Updating..." },
    "btn.borrar": { es: "Borrar", en: "Delete" },
    "common.hoy": { es: "HOY", en: "TODAY" },
    "common.buscar": { es: "Búsqueda multi-termino...", en: "Multi-term search..." },
    "common.fecha_inicial": { es: "Fecha Inicial", en: "Start Date" },
    "common.fecha_final": { es: "Fecha Final", en: "End Date" },
    "col.fecha": { es: "Fecha/Hora", en: "Date/Time" },
    "col.operacion": { es: "No. Operación", en: "Operation No." },
    "col.caja": { es: "Caja", en: "Dry Van" },
    "col.sublinea": { es: "Sub-Línea", en: "Sub-Line" },
    "col.placascaja": { es: "Placas", en: "Plates" },
    "col.lineatransporte": { es: "Línea Transporte", en: "Transport Line" },
    "col.arribo": { es: "Arribo", en: "Arrival" },
    "col.comentariosArribo": { es: "Comentarios Arribo", en: "Arrival Comments" },
    "col.driverid": { es: "Driver ID", en: "Driver ID" },
    "col.driver": { es: "Nombre / Transportista", en: "Name / Carrier" },
    "col.placastracto": { es: "Placas Tracto", en: "Truck License" },
    "col.modelo": { es: "Modelo", en: "Model" },
    "col.sello": { es: "Sello Liberación", en: "Release Seal" },
    "col.cargado": { es: "CARGADO", en: "LOADED" },
    "col.sellado_time": { es: "FECHA/HORA SELLADO", en: "SEALED DATE/TIME" },
    "col.observaciones": { es: "OBSERVACIONES", en: "OBSERVATIONS" },
    
    // Formulario (Modales)
    "form.caja_sec": { es: "Equipo (Caja Seca de 53')", en: "Equipment (53-foot Dry Van)" },
    "form.tracto_sec": { es: "Tracto Camión", en: "Truck Tractor" },

    // Catálogos
    "cajas.num": { es: "Número Caja", en: "Dry Van No." },
    "cajas.carrier": { es: "Carrier Enlace", en: "Linked Carrier" },
    "cajas.linea": { es: "Línea Transporte", en: "Transport Line" },
    "cajas.sublinea": { es: "Sub-Línea", en: "Sub-Line" },
    "cajas.clave": { es: "Clave Ap. 10", en: "App. 10 Code" },
    "cajas.tipo": { es: "Tipo Caja", en: "Type" },
    "cajas.placas": { es: "Placas", en: "License Plates" },
    "driver.name": { es: "Nombre (Driver ID)", en: "Name (Driver ID)" },
    "driver.carrier": { es: "Carrier Padre", en: "Parent Carrier" },
    "driver.linea": { es: "Línea de Transporte", en: "Transport Line" },
    "driver.licencia": { es: "Licencia", en: "License" },
    "driver.tel": { es: "Teléfono", en: "Phone" },
    "driver.placas": { es: "Placas Tracto", en: "Tractor Plates" },
    "tl.id": { es: "Línea ID (Key)", en: "Line ID (Key)" },
    "tl.carrier": { es: "Carrier Padre", en: "Parent Carrier" },
    "tl.sublinea": { es: "Nombre Sub-Línea", en: "Sub-Line Name" },
    "tl.razon": { es: "Razón Social", en: "Legal Name" },
    "tl.mexicana": { es: "Línea Mexicana", en: "Mexican Line" },
    "car.cod": { es: "Código", en: "Code" },
    "car.nombre": { es: "Nombre / Alias", en: "Name / Alias" },
    "car.razon": { es: "Razón Social", en: "Legal Name" },
    "btn.acciones": { es: "Acciones", en: "Actions" },

    // Pre-Alerts
    "pre.status": { es: "Estatus", en: "Status" },
    "pre.file": { es: "Archivo", en: "File" },
    "pre.booking": { es: "Reserva / AWB", en: "Booking / AWB" },
    "pre.containers": { es: "Contenedores (Enc/Esp)", en: "Containers (Found/Expected)" },
    "pre.message": { es: "Mensaje", en: "Message" },
    "pre.mode": { es: "Modalidad", en: "Mode" },
    "pre.model": { es: "Modelo", en: "Model" },
    "pre.etd": { es: "ETD", en: "ETD" },
    "pre.dep_city": { es: "Ciudad Origen", en: "Departure City" },
    "pre.eta": { es: "ETA", en: "ETA" },
    "pre.arr_city": { es: "Ciudad Destino", en: "Arrival City" },
    "pre.invoice": { es: "Factura No", en: "Invoice No" },
    "pre.action": { es: "Acción", en: "Action" },

    // Customs Clearance
    "cust.action": { es: "Acción", en: "Action" },
    "cust.bl": { es: "Número de BL / AWB", en: "BL / AWB Number" },
    "cust.container": { es: "Número de Contenedor", en: "Container Number" },
    "cust.ata": { es: "Ata Port", en: "ATA Port" },
    "cust.pedimento": { es: "Número de Pedimento", en: "Entry / Pedimento number" },
    "cust.key": { es: "Clave", en: "Key" },
    "cust.assigned": { es: "Asignación de revisión", en: "Proforma Revision by:" },
    "cust.target": { es: "Fecha meta de finalización", en: "Target review completion date" },
    "cust.sent": { es: "1er envío de Proforma", en: "Pedimento Proforma Sent" },
    "cust.auth": { es: "Aprobación de Pedimento", en: "Pedimento Authorized" },
    "cust.pece_req": { es: "Fecha solicitud PECE", en: "PECE Request date" },
    "cust.pece_auth": { es: "Fecha autorización PECE", en: "PECE Auth date" },
    "cust.pay": { es: "Fecha de pago Ped.", en: "Pedimento Payment Date" },
    "cust.appoint": { es: "Cita de Despacho", en: "Truck appointment Date" },
    "cust.ata_fac": { es: "ATA Planta", en: "ATA factory" },
    "cust.eir": { es: "Fecha retorno vacío", en: "EIR date" },

    // Equipment Tracking
    "eq.action": { es: "Acción", en: "Action" },
    "eq.proj": { es: "Proyecto / Sección", en: "Project Section" },
    "eq.batch": { es: "Lote de Envío", en: "Shipment Batch" },
    "eq.pic": { es: "Responsable", en: "Person in charge" },
    "eq.loc": { es: "Lugar de descarga", en: "Unloading location" },
    "eq.party": { es: "Responsable descarga", en: "Unloading party" },
    "eq.tools": { es: "Herramientas descarga", en: "Unloading tools" },
    "eq.status": { es: "Estatus", en: "Status" },
    "eq.size": { es: "Tamaño/Tipo de Equipo", en: "Equipment Container Size" },
    "eq.qty": { es: "Cantidad", en: "Container Qty" },
    "eq.container": { es: "Número de Contenedor", en: "Container No." },
    "eq.bl": { es: "Número de BL", en: "BL No." },
    "eq.etd": { es: "ETD (Salida Estimada)", en: "ETD" },
    "eq.atd": { es: "ATD (Salida Real)", en: "ATD" },
    "eq.eta": { es: "ETA (Llegada a Puerto)", en: "ETA Port" },

    // Vessel / Shipment Plan Tracking
    "vt.action": { es: "Acción", en: "Action" },
    "vt.ref": { es: "Número de Ref.", en: "Ref No." },
    "vt.model": { es: "Modelo/Proyecto", en: "Model code / Items Name" },
    "vt.qty": { es: "Cantidad", en: "Qty" },
    "vt.type": { es: "Tipo Proy.", en: "Project types" },
    "vt.contract": { es: "Contrato CF", en: "CF contract No." },
    "vt.invoice": { es: "Factura CF", en: "CF Invoice No." },
    "vt.shipping": { es: "Naviera", en: "Shipping Company" },
    "vt.terminal": { es: "Terminal", en: "Terminal" },
    "vt.bl": { es: "Número de BL", en: "BL No." },
    "vt.container": { es: "Num. Contenedor", en: "Container No." },
    "vt.size": { es: "Tamaño", en: "Container Size" },
    "vt.etd": { es: "ETD Estimado", en: "ETD" },
    "vt.eta": { es: "ETA Puerto", en: "ETA Port" },
    "vt.prealert": { es: "Fecha Pre-Alerta", en: "Pre-Alert Date" },
    "vt.atd": { es: "ATD Real", en: "ATD" },
    "vt.ata": { es: "ATA Puerto", en: "ATA Port" },

    // BOM Analyzer
    "bom.estilo": { es: "ESTILO (Product No.)", en: "STYLE (Product No.)" },
    "bom.modelo": { es: "MODELO", en: "MODEL" },
    "bom.hnos_sin_bom": { es: "Hermanos sin BOM", en: "Siblings without BOM" },
    "bom.prod_sin_bom": { es: "Products sin BOM (por año)", en: "Products without BOM (by year)" },
    "bom.qty": { es: "Cantidad", en: "Qty" },
    "bom.insumo": { es: "INSUMO", en: "INPUT (ITEM)" },
    "bom.cant": { es: "CANTIDAD", en: "QUANTITY" },
    "bom.nota": { es: "NOTA", en: "NOTE" },
    "bom.regimen": { es: "RÉGIMEN", en: "REGIME" },
    "bom.desc": { es: "DESCRIPCIÓN", en: "DESCRIPTION" },
    "bom.cant_detec": { es: "CANTIDADES DETECTADAS", en: "DETECTED QUANTITIES" },
    "bom.estado": { es: "ESTADO", en: "STATUS" },
    "bom.merma": { es: "MERMA", en: "WASTE" },
    "bom.unidad": { es: "UNIDAD", en: "UNIT" },
    "bom.fechaini": { es: "FECHA.INI", en: "START.DATE" },
    "bom.fechafin": { es: "FECHA.FIN", en: "END.DATE" },

    // CI Extractor
    "ci.actions": { es: "Acciones", en: "Actions" },
    "ci.item": { es: "Ítem", en: "Item" },
    "ci.r8diff": { es: "R8 Dif", en: "R8Diff" },
    "ci.estimated": { es: "Estimado", en: "Estimated" },
    "ci.sensible": { es: "Sensible", en: "Sensible" },
    "ci.ndb": { es: "NDB", en: "NDB" },
    "ci.invoice": { es: "Factura", en: "Invoice No" },
    "ci.bl": { es: "BL / Guía", en: "BL" },
    "ci.container": { es: "Contenedor", en: "Container/Guide" },
    "ci.date": { es: "Fecha", en: "Date" },
    "ci.regimen": { es: "Régimen", en: "Regimen" },
    "ci.incoterm": { es: "Incoterm", en: "Incoterm" },
    "ci.hts": { es: "HTS", en: "HTS" },
    "ci.clavesat": { es: "Clave SAT", en: "CLAVESAT" },
    "ci.igi": { es: "IGI", en: "IGI Duty" },
    "ci.prosec": { es: "PROSEC", en: "PROSEC" },
    "ci.r8": { es: "R8", en: "R8" },
    "ci.part": { es: "Num Parte", en: "Part No" },
    "ci.model": { es: "Modelo", en: "Model" },
    "ci.english": { es: "Desc (EN)", en: "English Name" },
    "ci.desc_es": { es: "Desc (ES)", en: "Desc " },
    "ci.qty": { es: "Cant", en: "Qty" },
    "ci.um": { es: "UM", en: "UM" },
    "ci.netwt": { es: "Peso Neto", en: "Net Weight" },
    "ci.totalnetwt": { es: "Peso Neto Tot", en: "Total Net Wt" },
    "ci.unitprice": { es: "P. Unitario", en: "Unit Price" },
    "ci.total": { es: "Total", en: "Total" },

    // Dashboard
    "dash.title": { es: "Dashboard Operacional", en: "Operational Dashboard" },
    "dash.subtitle_live": { es: "DataStage — pedimentos cargados", en: "DataStage — loaded pedimentos" },
    "dash.subtitle_static": { es: "Customs Report — Sin datos cargados", en: "Customs Report — No data loaded" },
    "dash.live_badge": { es: "Datos en Vivo", en: "Live Data" },
    "dash.loading": { es: "Cargando pedimentos...", en: "Loading pedimentos..." },

    // Live KPI section
    "dash.sec_realtime": { es: "Operaciones en Tiempo Real", en: "Real-Time Operations" },
    "dash.vessels": { es: "Buques en Tránsito", en: "Vessels in Transit" },
    "dash.vessels_sub": { es: "Sin ATA Puerto", en: "No ATA Port" },
    "dash.port": { es: "En Puerto", en: "At Port" },
    "dash.port_sub": { es: "Pendiente Despacho", en: "Pending Clearance" },
    "dash.delivered": { es: "Entregados (Mes)", en: "Delivered (Month)" },
    "dash.delivered_sub": { es: "ATA Planta confirmado", en: "ATA Factory confirmed" },
    "dash.spend": { es: "Gasto Logístico", en: "Logistics Spend" },
    "dash.spend_sub": { es: "Flete+Aduana+Transporte", en: "Freight+Customs+Transport" },

    // YTD Summary section
    "dash.sec_ytd": { es: "Resumen Aduanal", en: "Customs Summary" },
    "dash.imp_ped": { es: "Pedimentos Importación", en: "Import Pedimentos" },
    "dash.exp_ped": { es: "Pedimentos Exportación", en: "Export Pedimentos" },
    "dash.imp_val": { es: "Valor Importado", en: "Import Value" },
    "dash.exp_val": { es: "Valor Exportado", en: "Export Value" },
    "dash.ytd_sub": { es: "Total YTD", en: "Total YTD" },
    "dash.usd_acc": { es: "USD acumulado", en: "USD accumulated" },
    "dash.no_data_warn": { es: "Mostrando datos en ceros. Descarga datos o sube archivos M3 en DataStage para ver información.", en: "Showing zeroed data. Download data or upload M3 files in DataStage to see information." },

    // Alert badges
    "dash.alert1": { es: "⚠ Exportaciones Julio −80%", en: "⚠ July Exports −80%" },
    "dash.alert2": { es: "⚠ Aranceles Mat. Prima Julio $188K", en: "⚠ July Raw Material Duties $188K" },
    "dash.alert3": { es: "50% revisiones concentradas en Q1", en: "50% of reviews concentrated in Q1" },
    "dash.alert4": { es: "Ahorro GID $291,600 USD YTD", en: "GID Savings $291,600 USD YTD" },

    // Import section
    "dash.sec_import": { es: "Importación", en: "Import" },
    "dash.chart_imp_vol": { es: "Volumen — Pedimentos de Importación", en: "Volume — Import Pedimentos" },
    "dash.chart_imp_vol_sub": { es: "Cantidad mensual por régimen (IN / A1 / AF)", en: "Monthly count by regime (IN / A1 / AF)" },
    "dash.chart_imp_val": { es: "Valor de Importación", en: "Import Value" },
    "dash.chart_imp_val_sub": { es: "Millones USD por mes", en: "USD Millions per month" },

    // Export section
    "dash.sec_export": { es: "Exportación", en: "Export" },
    "dash.chart_exp_vol": { es: "Volumen — Pedimentos de Exportación (RT)", en: "Volume — Export Pedimentos (RT)" },
    "dash.chart_exp_vol_sub": { es: "Cantidad mensual régimen retorno", en: "Monthly count return regime" },
    "dash.chart_exp_val": { es: "Valor de Exportación", en: "Export Value" },
    "dash.chart_exp_val_sub": { es: "Millones USD por mes", en: "USD Millions per month" },

    // Special ops + VAT
    "dash.sec_special": { es: "Operaciones Especiales y Contribuciones", en: "Special Operations & Taxes" },
    "dash.chart_special": { es: "Operaciones Especiales — Temporal a Definitivo", en: "Special Operations — Temp to Permanent" },
    "dash.chart_special_sub": { es: "Cantidad de pedimentos convertidos", en: "Converted pedimentos count" },
    "dash.chart_contrib": { es: "Contribuciones Pagadas", en: "Taxes Paid" },
    "dash.chart_contrib_sub_live": { es: "IGI + IVA por mes (DataStage)", en: "IGI + VAT per month (DataStage)" },
    "dash.chart_contrib_sub_static": { es: "(miles MXN)", en: "(thousands MXN)" },

    // Savings + Revisions
    "dash.sec_savings": { es: "Ahorros GID y Revisiones", en: "GID Savings & Revisions" },
    "dash.chart_gid": { es: "Ahorros GID Acumulados YTD", en: "GID Accumulated Savings YTD" },
    "dash.chart_gid_sub": { es: "Miles USD (clasificación arancelaria)", en: "USD Thousands (tariff classification)" },
    "dash.chart_rev": { es: "Revisiones Aduanales Import / Export", en: "Import / Export Customs Reviews" },
    "dash.chart_rev_sub": { es: "Carga archivos para ver datos", en: "Load files to see data" },
    "dash.rev_import": { es: "Revisiones Import", en: "Import Reviews" },
    "dash.rev_export": { es: "Revisiones Export", en: "Export Reviews" },

    // Specialists
    "dash.sec_specialists": { es: "Desempeño de Especialistas", en: "Specialists Performance" },

    // ── Saldo Fianza Module ──────────────────────────────────────────────────
    "sf.desktop_only":      { es: "Solo Versión de Escritorio",       en: "Desktop Version Only" },
    "sf.desktop_msg":       { es: "El módulo de Saldo Fianza requiere una resolución de pantalla más amplia. Por favor, accede desde una computadora para utilizar estas herramientas.", en: "The Saldo Fianza module requires a wider screen resolution. Please access it from a desktop computer." },

    // Metadata cards
    "sf.forma_pago":        { es: "FORMA DE PAGO",         en: "PAYMENT METHOD" },
    "sf.inst_emisora":      { es: "INSTITUCIÓN EMISORA",   en: "ISSUING INSTITUTION" },
    "sf.fianza":            { es: "FIANZA",                en: "BOND" },
    "sf.fecha_auth":        { es: "FECHA AUTORIZACIÓN",    en: "AUTHORIZATION DATE" },
    "sf.importe_doc":       { es: "IMPORTE DEL DOCUMENTO", en: "DOCUMENT AMOUNT" },
    "sf.imp_pagados":       { es: "IMPUESTOS PAGADOS",     en: "TAXES PAID" },
    "sf.imp_provisionados": { es: "IMPUESTOS PROVISIONADOS", en: "PROVISIONED TAXES" },
    "sf.imp_por_pagar":     { es: "IMPUESTOS POR PAGAR",  en: "TAXES PENDING PAYMENT" },
    "sf.saldo_utilizado":   { es: "SALDO UTILIZADO",       en: "BALANCE USED" },
    "sf.saldo_actual":      { es: "Saldo Actual de Fianza", en: "Current Bond Balance" },
    "sf.saldo_desc":        { es: "Se actualiza en tiempo real con el dato de la columna saldo final del último pedimento procesado.", en: "Updated in real time with the final balance column of the last processed pedimento." },

    // Header / toolbar
    "sf.title":             { es: "Control de Saldo Fianza",                             en: "Bond Balance Control" },
    "sf.subtitle":          { es: "Gestión contable y estado de pedimentos provisionados.", en: "Accounting management and provisioned pedimentos status." },
    "sf.mass_query":        { es: "Mass Query",        en: "Mass Query" },
    "sf.active_filters":    { es: "Filtros Activos",   en: "Active Filters" },
    "sf.plantilla":         { es: "Plantilla",         en: "Template" },
    "sf.cargar_datos":      { es: "Cargar Datos",      en: "Load Data" },
    "sf.exportar":          { es: "Exportar",          en: "Export" },
    "sf.nuevo":             { es: "Nuevo",             en: "New" },
    "sf.pago":              { es: "Pago",              en: "Payment" },
    "sf.start_date":        { es: "Fecha Inicio",      en: "Start Date" },
    "sf.end_date":          { es: "Fecha Fin",         en: "End Date" },
    "sf.borrar":            { es: "Borrar",            en: "Delete" },

    // Table
    "sf.historico":         { es: "Historial de Movimientos", en: "Movement History" },
    "sf.mostrando":         { es: "Mostrando",   en: "Showing" },
    "sf.de":                { es: "de",          en: "of" },
    "sf.col_acciones":      { es: "Acciones",          en: "Actions" },
    "sf.col_pedimento":     { es: "Pedimento",         en: "Pedimento" },
    "sf.col_nombre":        { es: "Nombre",            en: "Name" },
    "sf.col_provisionado":  { es: "Provisionado",      en: "Provisioned" },
    "sf.col_fecha_reg":     { es: "Fecha de Registro", en: "Registration Date" },
    "sf.col_pagado":        { es: "Pagado",            en: "Paid" },
    "sf.col_fecha_pago":    { es: "Fecha de Pago",     en: "Payment Date" },
    "sf.col_saldo_ini":     { es: "Saldo Inicial",     en: "Initial Balance" },
    "sf.col_saldo_fin":     { es: "Saldo Final",       en: "Final Balance" },
    "sf.no_records":        { es: "No se encontraron registros que coincidan con la búsqueda.", en: "No records found matching your search." },

    // Mass Query builder
    "sf.query_title":       { es: "Advanced Query Builder", en: "Advanced Query Builder" },
    "sf.query_desc":        { es: "Configura múltiples condiciones para filtrar los pedimentos de Fianza.", en: "Configure multiple conditions to filter Bond pedimentos." },
    "sf.q_column":          { es: "Columna",    en: "Column" },
    "sf.q_operator":        { es: "Operador",   en: "Operator" },
    "sf.q_datatype":        { es: "Tipo Dato",  en: "Data Type" },
    "sf.q_string":          { es: "String (Texto/Fecha)", en: "String (Text/Date)" },
    "sf.q_number":          { es: "Número (Montos)",      en: "Number (Amounts)" },
    "sf.q_target":          { es: "Valor Objetivo",       en: "Target Value" },
    "sf.q_values_per_line": { es: "Valores (uno por línea)", en: "Values (One per line)" },
    "sf.q_not_required":    { es: "Valor (no requerido)",    en: "Value (Not required)" },
    "sf.add_condition":     { es: "Agregar Condición", en: "Add Condition" },
    "sf.clear_all":         { es: "Limpiar Todo",      en: "Clear All" },
    "sf.run_query":         { es: "Ejecutar Búsqueda", en: "Run Query" },

    // Payment modal
    "sf.pay_title":         { es: "Registrar Pago",         en: "Register Payment" },
    "sf.pay_desc":          { es: "Selecciona un pedimento sin pagar para asentar su pago. Selecciona la fecha de liquidación.", en: "Select an unpaid pedimento to record its payment. Select the settlement date." },
    "sf.pay_pedimentos":    { es: "Pedimento(s) Sin Pagar", en: "Unpaid Pedimento(s)" },
    "sf.pay_hint":          { es: "Usa Cmd o Ctrl para selección múltiple.", en: "Use Cmd or Ctrl for multiple selection." },
    "sf.pay_fecha":         { es: "Fecha de Pago",  en: "Payment Date" },
    "sf.pay_monto":         { es: "Monto Pagado",   en: "Amount Paid" },
    "sf.pay_monto_sum":     { es: "Suma Total",      en: "Total Sum" },
    "sf.cancelar":          { es: "Cancelar",        en: "Cancel" },
    "sf.confirmar_pago":    { es: "Confirmar Pago",  en: "Confirm Payment" },

    // New record modal
    "sf.new_record_title":  { es: "Nuevo Registro de Pedimento", en: "New Pedimento Record" },
    "sf.nombre_placeholder":{ es: "Ej. Luis",   en: "e.g. Luis" },
    "sf.no_users":          { es: "No hay usuarios disponibles", en: "No users available" },
    "sf.saldo_previsto":    { es: "Saldo Inicial Previsto:",     en: "Expected Initial Balance:" },
    "sf.saldo_resultante":  { es: "Saldo Final Resultante:",     en: "Resulting Final Balance:" },
    "sf.registrar_guardar": { es: "Registrar y Guardar",         en: "Register & Save" },

    // Edit modal
    "sf.edit_title":        { es: "Editar Registro",   en: "Edit Record" },
    "sf.nombre_resp":       { es: "Nombre Responsable", en: "Responsible Name" },
    "sf.fecha_reg_short":   { es: "Fecha Reg.",         en: "Reg. Date" },
    "sf.fecha_pago_short":  { es: "Fecha Pago",         en: "Payment Date" },
    "sf.guardar_edit":      { es: "Guardar Editado",    en: "Save Edited" },

    // Shared labels repeated in forms
    "sf.pedimento_label":   { es: "Pedimento",    en: "Pedimento" },
    "sf.provisionado":      { es: "Provisionado", en: "Provisioned" },
    "sf.pagado":            { es: "Pagado",       en: "Paid" },
    "sf.fecha_registro":    { es: "Fecha de Registro", en: "Registration Date" },

    // ── Dashboard — tarjetas KPI ─────────────────────────────────────────────
    "dash.cloud_mode":      { es: "Firebase Cloud", en: "Firebase Cloud" },
    "dash.local_mode":      { es: "Local",           en: "Local" },
    "dash.all_history":     { es: "Todo el historial", en: "Full history" },
    "dash.sync_indicator":  { es: "Sincronizando datos...", en: "Syncing data..." },
    "dash.sync_msg":        { es: "Los datos no se han cargado. Sincroniza desde la nube.", en: "Data not loaded. Sync from the cloud." },
    "dash.sync_btn":        { es: "Descargar Datos", en: "Download Data" },
    "dash.syncing":         { es: "Sincronizando...", en: "Syncing..." },
    "dash.pedimentos_loaded":{ es: "pedimentos cargados", en: "pedimentos loaded" },

    // Contenedores por mes
    "dash.chart_cont_mes":       { es: "CONTENEDORES POR MES", en: "CONTAINERS BY MONTH" },
    "dash.chart_cont_mes_empty": { es: "Sin datos — sube ZIPs en DataStage", en: "No data — upload ZIPs in DataStage" },
    "dash.meses":                { es: "meses", en: "months" },
    "dash.antiguo_izq":          { es: "más antiguo a la izquierda", en: "oldest to the left" },

    // Tarjetas contenedores / facturas
    "dash.cont_imp":      { es: "CONTENEDORES IMPORTACIÓN", en: "IMPORT CONTAINERS" },
    "dash.cont_imp_sub":  { es: "504 — contenedores IMP",   en: "504 — IMP containers" },
    "dash.cont_exp":      { es: "CONTENEDORES EXPORTACIÓN", en: "EXPORT CONTAINERS" },
    "dash.cont_exp_sub":  { es: "504 — contenedores EXP",   en: "504 — EXP containers" },
    "dash.unit_cont":     { es: "cont.", en: "cont." },
    "dash.fact_imp":      { es: "FACTURAS IMPORTACIÓN",     en: "IMPORT INVOICES" },
    "dash.fact_imp_sub":  { es: "505 — facturas comerciales", en: "505 — commercial invoices" },
    "dash.fact_exp":      { es: "FACTURAS EXPORTACIÓN",     en: "EXPORT INVOICES" },
    "dash.fact_exp_sub":  { es: "505 + 507-ED (CFDIs)",     en: "505 + 507-ED (CFDIs)" },
    "dash.unit_fact":     { es: "fact.", en: "inv." },

    // Nombres de series en las gráficas
    "dash.bar_in":         { es: "Import Normal (IN)",    en: "Normal Import (IN)" },
    "dash.bar_a1":         { es: "Temporal (A1)",         en: "Temporary (A1)" },
    "dash.bar_af":         { es: "Activo Fijo (AF)",      en: "Fixed Asset (AF)" },
    "dash.bar_rt":         { es: "Exportación RT",        en: "RT Export" },
    "dash.bar_mat_prima":  { es: "Mat. Prima + Indir.",   en: "Raw Mat. + Indirect" },
    "dash.bar_activo_fijo":{ es: "Activo Fijo",           en: "Fixed Asset" },
    "dash.bar_valor_exp":  { es: "Valor (M USD)",         en: "Value (M USD)" },
    "dash.bar_igi_imp":    { es: "IGI Imp (Efectivo)",    en: "IGI Import (Cash)" },
    "dash.bar_iva_imp_ef": { es: "IVA Imp (Efectivo)",   en: "VAT Import (Cash)" },
    "dash.bar_iva_imp_fz": { es: "IVA Imp (Fianza)",     en: "VAT Import (Bond)" },
    "dash.bar_dta_imp":    { es: "DTA Imp (Efectivo)",   en: "DTA Import (Cash)" },
    "dash.bar_igi_exp":    { es: "IGI Exp",               en: "IGI Export" },
    "dash.bar_iva_exp":    { es: "IVA Exp",               en: "VAT Export" },
    "dash.bar_dta_exp":    { es: "DTA Exp",               en: "DTA Export" },
    "dash.ahorro_label":   { es: "Ahorro",                en: "Savings" },
    "dash.valor_label":    { es: "Valor",                 en: "Value" },

    // Subtítulos de gráficas con datos live
    "dash.chart_contrib_sub_live": { es: "DataStage — 510 contribuciones (IGI/IVA/DTA) cruce 501×510", en: "DataStage — 510 contributions (IGI/VAT/DTA) 501×510 crossref" },

    // Etiquetas Imp/Exp en gráficas
    "dash.imp": { es: "Imp.", en: "Imp." },
    "dash.exp": { es: "Exp.", en: "Exp." },
};

interface LanguageContextProps {
    language: Language;
    toggleLanguage: () => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [language, setLanguage] = useState<Language>(() => {
        return (localStorage.getItem('logi_lang') as Language) || 'es';
    });

    useEffect(() => {
        localStorage.setItem('logi_lang', language);
    }, [language]);

    const toggleLanguage = () => {
        setLanguage(prev => (prev === 'es' ? 'en' : 'es'));
    };

    const t = (key: string): string => {
        const entry = translations[key];
        if (!entry) return key; // Fallback al key si no existe traducción
        return entry[language];
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextProps => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
