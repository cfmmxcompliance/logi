# Implementación de Pestaña "Dealers" en Partners & Suppliers

## Descripción
El objetivo es agregar una nueva pestaña llamada "Dealers" dentro del módulo "Partners & Suppliers". Esta nueva sección permitirá administrar a los Dealers (clientes/distribuidores) basándose en la estructura del archivo `DEALERS.xlsx`, con una colección independiente en la base de datos, y contará con funcionalidades para carga masiva (CSV), descarga (CSV), y registro manual.

## Análisis de Datos (Dealers)
Los registros tendrán la siguiente estructura de columnas exactas para la subida/descarga en CSV:
- `IdDealer`
- `Ship To` (Nombre del Dealer)
- `Address` (Dirección)
- `City` (Ciudad)
- `State` (Estado)
- `ZIP` (Código Postal)
- `Phone` (Teléfono)
- `Country` (País)

## Proposed Changes

### 1. Modelos y Tipos (`types.ts`)
- [NEW] Crear la interfaz `Dealer` con los campos correspondientes (usando camelCase internamente pero mapeando al CSV exacto): `id`, `idDealer`, `shipTo`, `address`, `city`, `state`, `zip`, `phone`, `country`, `createdAt`.
- [MODIFY] Extender `StorageState` para incluir `dealers: Dealer[]`.

### 2. Capa de Servicios (`services/storageService.ts`)
- [MODIFY] Agregar la referencia a la nueva colección `dealers` en `COLS`.
- [MODIFY] Implementar las funciones CRUD: `getDealers()`, `updateDealer()`, `deleteDealer()`, y sincronización con Firestore (`onSnapshot`).

### 3. Interfaz de Usuario (`pages/Suppliers.tsx`)
- [MODIFY] Refactorizar la vista principal para incluir un sistema de pestañas (Tabs): "Suppliers" y "Dealers".
- [MODIFY] Mover el contenido actual de proveedores a la pestaña "Suppliers".
- [NEW] Construir el contenido de la pestaña "Dealers":
  - **Barra Buscadora (Search Bar):** Filtrado general sobre todos los campos de forma anidada con separación de comas (similar a Partners & Suppliers).
  - **Mass Query (Advanced Query Builder):** Botón para habilitar filtrado avanzado masivo sobre todos los campos de la colección `dealers` (similar al de Master Data Management).
  - Tabla para mostrar la lista de Dealers con sus columnas correspondientes.
  - Botones de **Carga Masiva (CSV)** y **Descarga (CSV)**.
- [NEW] Modal "Add New Dealer": Un formulario diseñado específicamente para dar de alta/editar Dealers manualmente (IdDealer, Ship To, Address, City, State, ZIP, Phone, Country).

### 4. Utilidades de CSV
- Incorporar botones para exportar el array de dealers a CSV usando los headers exactos solicitados, y para leer un archivo CSV e iterar creando/actualizando (upsert) los registros en la colección `dealers` usando `IdDealer` como llave principal para evitar duplicados.

## Verification Plan
### Pruebas Manuales
1. Entrar al módulo "Partners & Suppliers" y verificar que existan las dos pestañas.
2. Comprobar que el modal de "Add New Partner" original sigue intacto en la pestaña de Suppliers.
3. En la pestaña "Dealers", usar el botón "Add Dealer" para verificar que abre su propio modal con los campos de Dealer.
4. Exportar la plantilla CSV (descarga) y verificar que tiene las 8 columnas exactas (`IdDealer`, `Ship To`, `Address`, `City`, `State`, `ZIP`, `Phone`, `Country`).
5. Subir un archivo CSV de prueba y validar que los Dealers se registren en la base de datos sin borrar la colección de suppliers original.

> [!CAUTION]
> **ESPERANDO APROBACIÓN**
> El plan ha sido actualizado con tus indicaciones (Colección independiente, inclusión de Country, mismos headers en CSV, y modal dedicado).
> **Para comenzar a programar, por favor escribe explícitamente "PROCEDE" o "APROBADO".**
