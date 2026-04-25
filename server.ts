
import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import urlencode from 'urlencode';
import http from 'http';
import https from 'https';
import puppeteer from 'puppeteer';

// Variables globales para Arquitectura de Navegador Reciclado
let globalBrowser: import('puppeteer').Browser | null = null;
let isLaunchingBrowser = false;

async function getGlobalBrowser() {
  if (globalBrowser && globalBrowser.isConnected()) {
    return globalBrowser;
  }
  if (isLaunchingBrowser) {
    while (isLaunchingBrowser) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return globalBrowser;
  }
  isLaunchingBrowser = true;
  try {
    globalBrowser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Vital contra colapsos de memoria temporal (OOM) en Railway
        '--disable-web-security', 
        '--ignore-certificate-errors'
      ]
    });
  } finally {
    isLaunchingBrowser = false;
  }
  return globalBrowser;
}

async function descargarPDFReal(pdfUrl: string): Promise<Buffer> {
  // Si es de SUNAT, descargar nativamente sin abrir Puppeteer (es ultrarrápido y no hay Incapsula)
  if (pdfUrl.includes('sunat.gob.pe')) {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    return Buffer.from(response.data);
  }

  const browser = await getGlobalBrowser();
  let page: import('puppeteer').Page | null = null;
  
  try {
    page = await browser!.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Evitar restricciones de Content-Security-Policy de la página que puedan bloquear nuestro fetch()
    await page.setBypassCSP(true);

    const urlObj = new URL(pdfUrl);
    await page.goto(urlObj.origin, { waitUntil: 'networkidle2' });

    const base64Data = await page.evaluate(async (url) => {
      // Corrección Crítica: Mixed Content
      // Si el origin cargó en HTTPS pero la pdfUrl es HTTP, Chromium bloqueará
      // el fetch() instantáneamente arrojando "TypeError: Failed to fetch".
      if (window.location.protocol === 'https:' && url.startsWith('http:')) {
        url = url.replace('http:', 'https:');
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, pdfUrl);
    
    // Decodificar Base64 directo a Buffer usando Node.js
    const b64Data = base64Data.split(',')[1];
    const buffer = Buffer.from(b64Data, 'base64');
    
    // 3. Validación de firma (Magic Number)
    // El "Magic Number" de un PDF es %PDF- (25 50 44 46 2D...)
    // Verifica si los primeros 4 bytes corresponden.
    if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
      throw new Error('La descarga falló: El contenido no tiene firma PDF (posible bloqueo mantenido por Incapsula).');
    }
    
    return buffer;
  } finally {
    // Muy importante: ¡Solo cerramos la pestaña, mantenemos vivo el navegador!
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create agents to handle connections better
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get('/api/search', async (req, res) => {
    let retries = 3;
    while (retries > 0) {
      try {
        const { todas, exacta, max, cerca, algunas, oper, sin, rtfSumilla, filtroFecha, fechaBegin, fechaEnd, count } = req.query;

        const rawParams: any = {
          rtfSumilla: rtfSumilla || '1',
          todas: todas || '',
          exacta: exacta || '',
          max: max || '20',
          cerca: cerca || '',
          algunas: algunas || '',
          oper: oper || '',
          sin: sin || '',
          Buscar: count ? 'navegator' : 'Iniciar Búsqueda'
        };

        if (count) {
          rawParams.count = count;
        }

        if (filtroFecha === 'on') {
          rawParams.filtroFecha = 'on';
          rawParams.fechaBegin = fechaBegin || '01/01/1964';
          rawParams.fechaEnd = fechaEnd || '01/01/2007';
        }

        // Encode parameters to ISO-8859-1
        const encodedParams = Object.keys(rawParams).map(key => {
          return `${key}=${urlencode(rawParams[key] as string, 'iso-8859-1')}`;
        }).join('&');

        const url = `https://apps4.mineco.gob.pe/ServiciosTF/nuevo_ContenidoAvanzado.htm?${encodedParams}`;

        console.log(`Searching URL (Attempt ${4 - retries}):`, url);

        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000, // 15 seconds timeout per attempt
          httpAgent,
          httpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'https://apps4.mineco.gob.pe/ServiciosTF/nuevo_ContenidoAvanzado.htm',
            'Connection': 'close'
          }
        });

        const html = iconv.decode(Buffer.from(response.data), 'iso-8859-1');
        const $ = cheerio.load(html);

        const results: any[] = [];

        // Try to find total results
        let totalResults = 0;
        const totalMatch = html.match(/La b&uacute;squeda devolvi&oacute;\s*<strong>(\d+)<\/strong>/i) ||
          html.match(/La búsqueda devolvió\s*<strong>(\d+)<\/strong>/i);

        if (totalMatch) {
          totalResults = parseInt(totalMatch[1]);
        } else {
          // Fallback to searching for the strong tag directly
          $('strong').each((i, el) => {
            const text = $(el).text().trim();
            if (/^\d+$/.test(text) && $(el).parent().text().includes('devolvió')) {
              totalResults = parseInt(text);
            }
          });
        }

        // Parse results
        $('a').each((i, el) => {
          const onClick = $(el).attr('onClick') || $(el).attr('onclick');
          if (onClick && onClick.includes('openPDF')) {
            const match = onClick.match(/openPDF\('([^']+)','([^']+)'\)/);
            if (match) {
              results.push({
                id: match[1],
                path: match[2],
                url: `http://www.mef.gob.pe/contenidos/tribu_fisc/Tribunal_Fiscal/PDFS/${match[2]}`
              });
            }
          }
        });

        console.log(`Found ${results.length} results on page, total: ${totalResults}`);

        return res.json({ totalResults, results });
      } catch (error: any) {
        retries--;
        console.error(`Search error (Attempts left: ${retries}):`, error.message);
        if (retries === 0) {
          return res.status(500).json({ error: `Error al conectar con el Tribunal Fiscal: ${error.message}` });
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  app.get('/api/sunat-search', async (req, res) => {
    try {
      const { anio } = req.query;
      if (!anio) {
        return res.status(400).json({ error: 'Falta proveer el parámetro año.' });
      }

      const url = `https://www.sunat.gob.pe/legislacion/oficios/${anio}/indcor.htm`;
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      
      // El portal de SUNAT usa UTF-8 en años recientes, pero ISO-8859-1 en los antiguos.
      // Leemos como UTF-8 por defecto. Si aparecen reliquias inválidas '', recurrimos a latin1.
      let html = Buffer.from(response.data).toString('utf8');
      if (html.includes('')) {
        html = iconv.decode(Buffer.from(response.data), 'latin1');
      }
      
      const $ = cheerio.load(html);
      
      const results: any[] = [];
      const baseUrl = `https://www.sunat.gob.pe/legislacion/oficios/${anio}/`;
      
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.toLowerCase().endsWith('.pdf')) {
          let text = $(el).text().trim();
          
          // Formateo para quitar saltos de línea internos
          text = text.replace(/\s+/g, ' ');

          // Restaurador mágico de caracteres por si la web combinó doble codificación (Mojibake)
          try {
            if (text.includes('Â°') || text.includes('Ã')) {
              text = decodeURIComponent(escape(text));
            }
          } catch (e) {}

          if (!text) {
            text = href.split('/').pop() || `Documento_Sin_Nombre_${i}`;
          }

          results.push({
            id: text,
            path: `SUNAT/${anio}/${text}.pdf`.replace(/(\/|\\|:|\*|\?|"|<|>|\|)/g, '_'), // Limpiamos para Windows path
            url: new URL(href, baseUrl).href
          });
        }
      });
      
      return res.json({ totalResults: results.length, results });
    } catch (error: any) {
      console.error('Error al explorar resoluciones SUNAT:', error.message);
      return res.status(500).json({ error: 'Error al conectar con la web de SUNAT. Puede que el sitio esté temporalmente indisponible o el año no tenga documentos.' });
    }
  });

  app.get('/api/rtf-search', async (req, res) => {
    console.log('Received RTF search request (GET):', req.query);
    return handleRtfSearch(req.query, res);
  });

  app.post('/api/rtf-search', async (req, res) => {
    console.log('Received RTF search request (POST):', req.body);
    return handleRtfSearch(req.body, res);
  });

  async function handleRtfSearch(params: any, res: any) {
    let retries = 3;
    while (retries > 0) {
      try {
        const { tipo, nro, sala, anio, adm } = params;

        const rawParams: any = {
          rtfexp: String(tipo || '1'),
          nro: String(nro || ''),
          sala: String(sala || '0'),
          anio: String(anio || '0'),
          admin: String(adm || '0'),
          count: '0',
          inputOpcion: 'rtfexp',
          Buscar: 'Buscar'
        };

        const encodedParams = Object.keys(rawParams).map(key => {
          return `${key}=${urlencode(rawParams[key] as string, 'iso-8859-1')}`;
        }).join('&');

        const url = `http://apps4.mineco.gob.pe/ServiciosTF/nuevo_busq_rtf.htm?${encodedParams}`;

        console.log(`Searching RTF URL (Attempt ${4 - retries}):`, url);

        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 15000,
          httpAgent,
          httpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Referer': 'http://apps4.mineco.gob.pe/ServiciosTF/nuevo_busq_rtf.htm',
            'Connection': 'close'
          }
        });

        const html = iconv.decode(Buffer.from(response.data), 'iso-8859-1');
        const $ = cheerio.load(html);

        const results: any[] = [];

        $('a').each((i, el) => {
          const onClick = $(el).attr('onClick') || $(el).attr('onclick');
          if (onClick && onClick.includes('openPDF')) {
            const match = onClick.match(/openPDF\('([^']+)','([^']+)'\)/);
            if (match) {
              results.push({
                id: match[1],
                path: match[2],
                url: `http://www.mef.gob.pe/contenidos/tribu_fisc/Tribunal_Fiscal/PDFS/${match[2]}`
              });
            }
          }
        });

        console.log(`RTF Search found ${results.length} results`);
        return res.json({ totalResults: results.length, results });
      } catch (error: any) {
        retries--;
        console.error(`RTF Search error (Attempts left: ${retries}):`, error.message);
        if (retries === 0) {
          return res.status(500).json({ error: `Error al conectar con el Tribunal Fiscal: ${error.message}` });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  app.post('/api/upload', async (req, res) => {
    try {
      const { pdfUrl, fileName, folderId } = req.body;

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        return res.status(400).json({ error: 'Google Drive credentials are not configured in the server (.env)' });
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Download PDF usando Puppeteer
      const buffer = await descargarPDFReal(pdfUrl);

      // Upload to Google Drive
      const tempPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, buffer);

      const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : []
      };

      const driveResponse = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/pdf',
          body: fs.createReadStream(tempPath)
        },
        fields: 'id',
        supportsAllDrives: true
      });

      fs.unlinkSync(tempPath);

      res.json({ success: true, fileId: driveResponse.data.id });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Catch-all error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  });
}

startServer();
