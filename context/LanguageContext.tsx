import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

type Language = 'es' | 'en' | 'zh';

interface Translations {
    [key: string]: {
        es: string;
        en: string;
        zh?: string;
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
    "asig.title": { es: "Asignación Diaria de Cajas Secas 53'", en: "Daily 53-foot Dry Van Assignment", zh: "53英尺干货车日常分配" },
    "asig.subtitle": { es: "Gestión operativa vinculando Cajas Secas 53' y Transportistas activos.", en: "Operational management linking 53' Dry Vans and active Carriers.", zh: "连接53英尺干货车与活跃承运人的运营管理。" },
    "asig.buscar": { es: "Búsqueda multi-termino (Operación, Caja, Driver, Placas, Transportista, Sellos, etc)...", en: "Multi-term search (Operation, Box, Driver, Plates, Carrier, Seals, etc)...", zh: "多条件搜索（操作、箱号、司机、车牌、承运人、封条等）..." },

    // Advanced Query Builder
    "qb.title": { es: "Constructor de Consultas Avanzadas", en: "Advanced Query Builder", zh: "高级查询构建器" },
    "qb.subtitle": { es: "Combina múltiples filtros para encontrar registros específicos.", en: "Combine multiple filters to find specific records in this catalog.", zh: "组合多个筛选条件查找特定记录。" },
    "qb.column": { es: "Columna", en: "Column", zh: "列" },
    "qb.operator": { es: "Operador", en: "Operator", zh: "运算符" },
    "qb.datatype": { es: "Tipo de Dato", en: "Data Type", zh: "数据类型" },
    "qb.op_in": { es: "(in) en lista", en: "(in) in list", zh: "(in) 在列表中" },
    "qb.op_eq": { es: "(==) igual a", en: "(==) equal to", zh: "(==) 等于" },
    "qb.op_neq": { es: "(!=) distinto de", en: "(!=) not equal to", zh: "(!=) 不等于" },
    "qb.op_contains": { es: "contiene", en: "contains", zh: "包含" },
    "qb.op_notcontains": { es: "no contiene", en: "not contains", zh: "不包含" },
    "qb.op_empty": { es: "está vacío / null", en: "is empty / null", zh: "为空 / null" },
    "qb.op_notempty": { es: "NO está vacío", en: "is NOT empty", zh: "不为空" },
    "qb.type_string": { es: "Texto (String)", en: "String (Text)", zh: "文本 (String)" },
    "qb.type_number": { es: "Número", en: "Number", zh: "数字" },
    "qb.type_boolean": { es: "Booleano", en: "Boolean", zh: "布尔值" },
    "qb.val_noreq": { es: "Valor (No requerido para este operador)", en: "Value (Not required for this operator)", zh: "值（此运算符不需要）" },
    "qb.val_list": { es: "Valores (uno por línea o separados por coma)", en: "Values (One per line or comma-separated)", zh: "值（每行一个或逗号分隔）" },
    "qb.val_target": { es: "Valor objetivo", en: "Target Value", zh: "目标值" },
    "qb.placeholder_in": { es: "Ejemplo:\nVal1 Val2 Val3\n(Separar por espacio, coma o nueva línea)", en: "Example:\nVal1 Val2 Val3\n(Separate by space, comma or newline)", zh: "示例：\nVal1 Val2 Val3\n（用空格、逗号或换行分隔）" },
    "qb.placeholder_val": { es: "Ingresa el valor objetivo...", en: "Enter target value...", zh: "输入目标值..." },
    "qb.add_condition": { es: "+ Agregar Condición", en: "+ Add Another Condition", zh: "+ 添加条件" },
    "qb.reset": { es: "Restablecer Todo", en: "Reset All", zh: "重置全部" },
    "qb.cancel": { es: "Cancelar", en: "Cancel", zh: "取消" },
    "qb.apply": { es: "Aplicar Filtro Complejo", en: "Apply Complex Filter", zh: "应用复杂筛选" },
    "btn.new": { es: "Asignar", en: "Assign", zh: "分配" },
    "btn.export": { es: "Exportar", en: "Export", zh: "导出" },
    "btn.mass": { es: "Filtros Masivos", en: "Mass Filters", zh: "批量筛选" },
    "btn.actualizar": { es: "Actualizar", en: "Update", zh: "更新" },
    "btn.actualizando": { es: "Actualizando...", en: "Updating...", zh: "更新中..." },
    "btn.borrar": { es: "Borrar", en: "Delete", zh: "删除" },
    "btn.cierre": { es: "Cierre", en: "Close", zh: "关闭" },
    "btn.cerrando": { es: "Cerrando...", en: "Closing...", zh: "关闭中..." },
    "btn.cierre_title": { es: "Cierre manual de operaciones pendientes con CCP", en: "Manual closure of pending operations with CCP", zh: "手动关闭待处理CCP操作" },
    "common.hoy": { es: "HOY", en: "TODAY", zh: "今天" },
    "common.buscar": { es: "Búsqueda multi-termino...", en: "Multi-term search...", zh: "多条件搜索..." },
    "common.fecha_inicial": { es: "Fecha Inicial", en: "Start Date", zh: "开始日期" },
    "common.fecha_final": { es: "Fecha Final", en: "End Date", zh: "结束日期" },
    "col.fecha": { es: "Fecha/Hora", en: "Date/Time", zh: "日期/时间" },
    "col.operacion": { es: "No. Operación", en: "Operation No.", zh: "操作编号" },
    "col.caja": { es: "Caja", en: "Dry Van", zh: "干货车" },
    "col.sublinea": { es: "Sub-Línea", en: "Sub-Line", zh: "子线路" },
    "col.placascaja": { es: "Placas", en: "Plates", zh: "车牌" },
    "col.lineatransporte": { es: "Línea Transporte", en: "Transport Line", zh: "运输线路" },
    "col.arribo": { es: "Arribo", en: "Arrival", zh: "到达" },
    "col.comentariosArribo": { es: "Comentarios Arribo", en: "Arrival Comments", zh: "到达备注" },
    "col.driverid": { es: "Driver ID", en: "Driver ID", zh: "司机ID" },
    "col.driver": { es: "Nombre / Transportista", en: "Name / Carrier", zh: "姓名 / 承运人" },
    "col.placastracto": { es: "Placas Tracto", en: "Truck License", zh: "牵引车牌" },
    "col.modelo": { es: "Modelo", en: "Model", zh: "型号" },
    "col.sello": { es: "Sello Liberación", en: "Release Seal", zh: "放行封条" },
    "col.cargado": { es: "CARGADO", en: "LOADED", zh: "已装载" },
    "col.sellado_time": { es: "FECHA/HORA SELLADO", en: "SEALED DATE/TIME", zh: "封签日期/时间" },
    "col.observaciones": { es: "OBSERVACIONES", en: "OBSERVATIONS", zh: "备注" },
    "col.creado": { es: "CREADO", en: "CREATED", zh: "创建时间" },
    "col.liberacion": { es: "LIBERACIÓN", en: "RELEASE", zh: "放行" },
    "col.layout": { es: "LAYOUT", en: "LAYOUT", zh: "布局" },
    "col.ccp": { es: "CCP", en: "CCP", zh: "CCP" },
    "col.anexo29": { es: "ANEXO 29", en: "ANNEX 29", zh: "附件29" },
    "col.sello_asignado": { es: "SELLO ASIGNADO", en: "ASSIGNED SEAL", zh: "指定封条" },
    "col.dock": { es: "DOCK", en: "DOCK", zh: "月台" },
    "col.tipo": { es: "TIPO", en: "TYPE", zh: "类型" },
    "col.vehiculos": { es: "VEHÍCULOS", en: "VEHICLES", zh: "车辆数" },

    // Filtros del indicador POR CERRAR / CERRADO
    "filter.todos": { es: "Todos", en: "All", zh: "全部" },
    "filter.por_cerrar": { es: "POR CERRAR", en: "PENDING", zh: "待关闭" },
    "filter.cerrado": { es: "CERRADO", en: "CLOSED", zh: "已关闭" },
    "filter.cancelado": { es: "CANCELADO", en: "CANCELLED", zh: "已取消" },
    "filter.sin_layout": { es: "sin layout", en: "no layout", zh: "无布局" },
    "filter.sin_ccp": { es: "sin CCP", en: "no CCP", zh: "无CCP" },
    "filter.veh": { es: "veh.", en: "veh.", zh: "辆" },


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
    "tl.comercial": { es: "Nombre Comercial", en: "Commercial Name" },
    "tl.sublinea": { es: "Nombre Sub-Línea", en: "Sub-Line Name" },
    "tl.razon": { es: "Razón Social", en: "Legal Name" },
    "tl.mexicana": { es: "Línea Mexicana", en: "Mexican Line" },
    "car.cod": { es: "Código", en: "Code" },
    "car.nombre": { es: "Nombre / Alias", en: "Name / Alias" },
    "car.razon": { es: "Razón Social", en: "Legal Name" },
    "btn.acciones": { es: "Acciones", en: "Actions", zh: "操作" },

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
    "dash.cont_imp":      { es: "TRANSACCIONES IMPORTACIÓN", en: "IMPORT TRANSACTIONS" },
    "dash.cont_imp_sub":  { es: "504 — transacciones IMP",   en: "504 — IMP transactions" },
    "dash.cont_exp":      { es: "TRANSACCIONES EXPORTACIÓN", en: "EXPORT TRANSACTIONS" },
    "dash.cont_exp_sub":  { es: "504 — transacciones EXP",   en: "504 — EXP transactions" },
    "dash.unit_cont":     { es: "trans.", en: "trans." },
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
    "dash.m_mxn": { es: "M MXN", en: "M MXN" },

    // Etiquetas Imp/Exp en gráficas
    "dash.imp": { es: "Imp.", en: "Imp." },
    "dash.exp": { es: "Exp.", en: "Exp." },
};

// ─── Simplified Chinese translations (merged at load) ─────────────────────
const ZH: Record<string, string> = {
    // Menú
    // Asignaciones
    // Comunes
    // Columnas
    // Formularios
    // Catálogos
    // Pre-Alerts
    // Customs Clearance
    // Equipment
    // Vessel Tracking
    // CI Extractor
    // Dashboard
    // Saldo Fianza
    // BOM
};

// Merge ZH into translations
Object.entries(ZH).forEach(([key, zh]) => {
    if (translations[key]) (translations[key] as any).zh = zh;
    else translations[key] = { es: zh, en: zh, zh };
});

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
        setLanguage(prev => prev === 'es' ? 'en' : prev === 'en' ? 'zh' : 'es');
    };

    const t = (key: string): string => {
        const entry = translations[key];
        if (!entry) return key;
        return (entry as any)[language] ?? entry['en'] ?? entry['es'] ?? key;
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
