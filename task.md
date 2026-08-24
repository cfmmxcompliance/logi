# Tareas Pestaña Dealers

- [x] 1. **Modelos (types.ts)**
  - [x] Añadir interfaz `Dealer`.
  - [x] Modificar `StorageState` añadiendo `dealers`.
- [x] 2. **Servicios (storageService.ts)**
  - [x] Añadir constante de colección `DEALERS`.
  - [x] Implementar `getDealers`, `updateDealer`, `deleteDealer`, `massImportDealers`.
  - [x] Agregar escucha a Firestore (`onSnapshot`).
- [x] 3. **Componente Principal (Suppliers.tsx)**
  - [x] Importar iconos y herramientas CSV (`PapaParse` / manual csv parse).
  - [x] Convertir la vista en sistema de pestañas (Tabs: "Partners" y "Dealers").
  - [x] Implementar la Tabla de Dealers.
  - [x] Implementar Barra Buscadora de Dealers.
  - [x] Integrar Mass Query (Advanced Query Builder) para Dealers.
  - [x] Modal "Add New Dealer" (manual).
  - [x] Funcionalidad "Import CSV" con headers exactos.
  - [x] Funcionalidad "Export CSV" con headers exactos.
- [x] 4. **Pruebas y Despliegue**
  - [x] Build & Deploy a Firebase.
