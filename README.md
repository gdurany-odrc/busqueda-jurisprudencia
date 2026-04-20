# Tribunal Fiscal Perú - Gestor de Resoluciones

Este proyecto te permite buscar, visualizar y gestionar resoluciones del Tribunal Fiscal utilizando Node.js, Express y Vite+React.

## Requisitos Previos

- Node.js (Versión 18 o superior)
- npm (Node Package Manager)

## Instalación y Arranque Local

1. **Instalar dependencias:**
   Abre una terminal en la ruta del proyecto y ejecuta:
   ```bash
   npm install
   ```

2. **Configurar las variables de entorno:**
   Asegúrate de tener tu archivo `.env` en la raíz del proyecto. Este archivo debe contener los accesos y credenciales que conectarán el gestor con tus servicios (como API Keys o tokens en caso de usar Google Drive u otros integradores).

3. **Ejecutar la aplicación:**
   Una vez instaladas las dependencias y lista la configuración, inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

   *Nota:* Este comando internamente autocompilará `server.ts` a `server.js` (para solucionar bugs de Windows con ciertos caracteres en rutas, un proceso que es automático) e iniciará tu servidor Node. 

4. **Acceso:**
   Abre tu navegador de preferencia y navega a `http://localhost:3000`.
