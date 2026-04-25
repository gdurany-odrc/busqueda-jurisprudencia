import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Eye, 
  CloudUpload, 
  Folder, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  ChevronLeft,
  Filter,
  Calendar,
  X,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface SearchResult {
  id: string;
  path: string;
  url: string;
  status?: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
}

export default function App() {
  const [searchMode, setSearchMode] = useState<'avanzada' | 'rtf' | 'sunat'>('avanzada');
  const [sunatParams, setSunatParams] = useState({
    anio: new Date().getFullYear().toString()
  });
  const [searchParams, setSearchParams] = useState({
    todas: '',
    exacta: '',
    max: '20',
    cerca: '',
    algunas: '',
    oper: '',
    sin: '',
    rtfSumilla: '1',
    filtroFecha: false,
    fechaBegin: '01/01/1964',
    fechaEnd: '01/01/2007'
  });

  const [rtfParams, setRtfParams] = useState({
    tipo: '1', // 1: RTF, 2: Expediente
    nro: '',
    sala: '0',
    anio: '',
    adm: '0'
  });

  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [folderId, setFolderId] = useState(localStorage.getItem('gdrive_folder_id') || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const salas = [
    { value: '0', label: '--TODAS--' },
    { value: '20', label: 'Oficina A. Quejas' },
    { value: '1', label: 'Sala 1' },
    { value: '2', label: 'Sala 2' },
    { value: '3', label: 'Sala 3' },
    { value: '4', label: 'Sala 4' },
    { value: '5', label: 'Sala 5' },
    { value: '7', label: 'Sala 7' },
    { value: '8', label: 'Sala 8' },
    { value: '9', label: 'Sala 9' },
    { value: '10', label: 'Sala 10' },
    { value: '11', label: 'Sala 11' },
    { value: '12', label: 'Sala 12' },
    { value: '13', label: 'Sala 13' },
    { value: '6', label: 'Sala Aduanas' },
  ];

  const administraciones = [
    { value: '0', label: '--TODAS--' },
    { value: 'sunat', label: 'Sunat Tributos Internos' },
    { value: 'aduanas', label: 'Sunat Tributos Aduaneros' },
    { value: 'muni', label: 'Tributos Municipales' },
    { value: 'otros', label: 'Otras Administraciones' },
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1964 + 1 }, (_, i) => (currentYear - i).toString());

  useEffect(() => {
    localStorage.setItem('gdrive_folder_id', folderId);
  }, [folderId]);

  const handleSearch = async (e?: React.FormEvent, page: number = 1) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setCurrentPage(page);
    try {
      let response;
      if (searchMode === 'avanzada') {
        const query = new URLSearchParams({
          ...searchParams,
          filtroFecha: searchParams.filtroFecha ? 'on' : 'off',
          count: page > 1 ? ((page - 1) * 5).toString() : ''
        } as any).toString();
        response = await fetch(`/api/search?${query}`);
      } else {
        const query = new URLSearchParams(rtfParams as any).toString();
        response = await fetch(`/api/rtf-search?${query}`);
      }
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setResults(data.results.map((r: any) => ({ ...r, status: 'idle' })));
      setTotalResults(data.totalResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSunatSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    setTotalResults(0);
    setCurrentPage(1);
    
    try {
      const response = await fetch(`/api/sunat-search?anio=${sunatParams.anio}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);
      
      setResults(data.results.map((r: any) => ({ ...r, status: 'idle' })));
      setTotalResults(data.totalResults);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setTotalResults(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Process each row
      const importedResults: SearchResult[] = [];
      
      for (const row of jsonData) {
        // Expected format in "Número" column: 03942-5-2010 (Nro-Sala-Año)
        // Or "RTF" column: RTF N° 03942-5-2010
        let numeroStr = row['Número'] || row['Numero'] || row['RTF'] || '';
        if (!numeroStr) continue;

        // Clean string: remove "RTF N° " and similar prefixes
        numeroStr = String(numeroStr).replace(/RTF\s*N°\s*/i, '').trim();

        const parts = numeroStr.split('-');
        if (parts.length < 3) continue;

        const nro = parts[0].trim();
        const sala = parts[1].trim(); // Numeric value from Excel (e.g. "5")
        const anio = parts[2].trim();

        // Search for this specific RTF
        try {
          const query = new URLSearchParams({
            tipo: '1',
            nro,
            sala,
            anio,
            adm: '0'
          }).toString();
          
          const response = await fetch(`/api/rtf-search?${query}`);
          const contentType = response.headers.get('content-type');
          
          if (!response.ok || !contentType?.includes('application/json')) {
            const errorText = await response.text();
            console.error(`Error response for ${numeroStr}:`, errorText);
            throw new Error(`Server returned ${response.status} ${response.statusText}${!contentType?.includes('application/json') ? ' (Not JSON)' : ''}`);
          }
          
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            importedResults.push(...data.results.map((r: any) => ({ ...r, status: 'idle' })));
          }
        } catch (err) {
          console.error(`Error searching for ${numeroStr}:`, err);
        }
        
        // Add a small delay to avoid overwhelming the server/portal
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setResults(importedResults);
      setTotalResults(importedResults.length);
      setSearchMode('rtf');
    } catch (err: any) {
      setError(`Error al procesar el Excel: ${err.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (result: SearchResult) => {
    setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'loading' } : r));
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfUrl: result.url,
          fileName: `${result.id}.pdf`,
          folderId
        })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'success' } : r));
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'error', error: err.message } : r));
    }
  };

  const uploadAll = async () => {
    if (uploadingAll) return;
    setUploadingAll(true);
    setError(null);
    
    try {
      if (searchMode === 'avanzada') {
        const totalPages = Math.ceil(totalResults / 5);
        
        for (let page = 1; page <= totalPages; page++) {
          const query = new URLSearchParams({
            ...searchParams,
            filtroFecha: searchParams.filtroFecha ? 'on' : 'off',
            count: page > 1 ? ((page - 1) * 5).toString() : ''
          } as any).toString();
          
          const response = await fetch(`/api/search?${query}`);
          const data = await response.json();
          
          if (data.error) throw new Error(`Error en página ${page}: ${data.error}`);
          
          if (page === currentPage) {
            setResults(data.results.map((r: any) => ({ ...r, status: 'idle' })));
          }

          for (const result of data.results) {
            if (page === currentPage) {
              setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'loading' } : r));
            }

            try {
              const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  pdfUrl: result.url,
                  fileName: `${result.id}.pdf`,
                  folderId
                })
              });
              
              const uploadData = await uploadRes.json();
              if (uploadData.error) throw new Error(uploadData.error);
              
              if (page === currentPage) {
                setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'success' } : r));
              }
            } catch (err: any) {
              if (page === currentPage) {
                setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'error', error: err.message } : r));
              }
            }
          }
        }
      } else {
        // For RTF mode (including Excel imports), all results are in the current state
        for (const result of results) {
          if (result.status === 'success') continue;
          
          setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'loading' } : r));

          try {
            const uploadRes = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pdfUrl: result.url,
                fileName: `${result.id}.pdf`,
                folderId
              })
            });
            
            const uploadData = await uploadRes.json();
            if (uploadData.error) throw new Error(uploadData.error);
            
            setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'success' } : r));
          } catch (err: any) {
            setResults(prev => prev.map(r => r.id === result.id ? { ...r, status: 'error', error: err.message } : r));
          }
        }
      }
    } catch (err: any) {
      setError(`Error en la subida masiva: ${err.message}`);
    } finally {
      setUploadingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#141414] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E5] px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-[#DA251C] p-2 rounded-lg">
            <FileText className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tribunal Fiscal Perú</h1>
            <p className="text-xs text-[#9E9E9E] font-medium uppercase tracking-wider">Gestor de Resoluciones</p>
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-[#F0F0F0] rounded-full transition-colors"
          title="Seleccionar Carpeta Destino"
        >
          <Folder className="w-5 h-5 text-[#4A4A4A]" />
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Search Form */}
        <div className="lg:col-span-4 space-y-4">
          {/* Mode Selector Accordion */}
          <div className="space-y-3">
            {/* Avanzada */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5E5] overflow-hidden">
              <button 
                onClick={() => setSearchMode('avanzada')}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${searchMode === 'avanzada' ? 'bg-[#DA251C] text-white' : 'hover:bg-[#F9F9F9]'}`}
              >
                <div className="flex items-center gap-3">
                  <Filter className="w-5 h-5" />
                  <span className="font-bold text-sm uppercase tracking-wider">Búsqueda Avanzada</span>
                </div>
                {searchMode === 'avanzada' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              <AnimatePresence>
                {searchMode === 'avanzada' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 space-y-4 border-t border-[#F0F0F0]">
                      <form onSubmit={handleSearch} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Buscar en</label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input 
                                type="radio" 
                                name="rtfSumilla" 
                                value="1" 
                                checked={searchParams.rtfSumilla === '1'}
                                onChange={e => setSearchParams({...searchParams, rtfSumilla: e.target.value})}
                                className="accent-[#DA251C]"
                              />
                              Toda la RTF
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input 
                                type="radio" 
                                name="rtfSumilla" 
                                value="2" 
                                checked={searchParams.rtfSumilla === '2'}
                                onChange={e => setSearchParams({...searchParams, rtfSumilla: e.target.value})}
                                className="accent-[#DA251C]"
                              />
                              Sumilla
                            </label>
                          </div>
                        </div>

                        {[
                          { id: 'todas', label: 'Con todas las palabras' },
                          { id: 'exacta', label: 'Con la frase exacta' },
                          { id: 'algunas', label: 'Con algunas de las palabras' },
                          { id: 'sin', label: 'Sin las palabras' },
                          { id: 'oper', label: 'Palabra con Operador ($ %)' },
                        ].map(field => (
                          <div key={field.id} className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">{field.label}</label>
                            <input 
                              type="text"
                              value={(searchParams as any)[field.id]}
                              onChange={e => setSearchParams({...searchParams, [field.id]: e.target.value})}
                              className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C] transition-colors"
                              placeholder="..."
                            />
                          </div>
                        ))}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Palabras Cercanas</label>
                            <input 
                              type="text"
                              value={searchParams.cerca}
                              onChange={e => setSearchParams({...searchParams, cerca: e.target.value})}
                              className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C] transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Distancia Máx.</label>
                            <input 
                              type="number"
                              value={searchParams.max}
                              onChange={e => setSearchParams({...searchParams, max: e.target.value})}
                              className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C] transition-colors"
                            />
                          </div>
                        </div>

                        <div className="pt-4 border-t border-[#F0F0F0] space-y-4">
                          <label className="flex items-center gap-2 text-sm cursor-pointer font-bold">
                            <input 
                              type="checkbox"
                              checked={searchParams.filtroFecha}
                              onChange={e => setSearchParams({...searchParams, filtroFecha: e.target.checked})}
                              className="accent-[#DA251C]"
                            />
                            Filtrar por Fecha
                          </label>

                          {searchParams.filtroFecha && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="grid grid-cols-2 gap-4 overflow-hidden"
                            >
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Desde</label>
                                <input 
                                  type="text"
                                  value={searchParams.fechaBegin}
                                  onChange={e => setSearchParams({...searchParams, fechaBegin: e.target.value})}
                                  className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C] transition-colors"
                                  placeholder="dd/mm/yyyy"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Hasta</label>
                                <input 
                                  type="text"
                                  value={searchParams.fechaEnd}
                                  onChange={e => setSearchParams({...searchParams, fechaEnd: e.target.value})}
                                  className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C] transition-colors"
                                  placeholder="dd/mm/yyyy"
                                />
                              </div>
                            </motion.div>
                          )}
                        </div>

                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full bg-[#DA251C] text-white font-bold py-3 rounded-xl hover:bg-[#B91C1C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                          Iniciar Búsqueda
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* RTF / Expediente */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5E5] overflow-hidden">
              <button 
                onClick={() => setSearchMode('rtf')}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${searchMode === 'rtf' ? 'bg-[#DA251C] text-white' : 'hover:bg-[#F9F9F9]'}`}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5" />
                  <span className="font-bold text-sm uppercase tracking-wider text-left">Por número de resolución o expediente</span>
                </div>
                {searchMode === 'rtf' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              <AnimatePresence>
                {searchMode === 'rtf' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 space-y-4 border-t border-[#F0F0F0]">
                      <div className="flex gap-2 mb-4">
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleExcelImport}
                          accept=".xlsx, .xls"
                          className="hidden"
                        />
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          disabled={loading}
                          className="flex-1 bg-green-600 text-white text-xs font-bold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          Importar Excel
                        </button>
                      </div>

                      <div className="relative flex items-center py-2">
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                        <span className="flex-shrink mx-4 text-[10px] font-bold text-[#9E9E9E] uppercase tracking-widest">O Búsqueda Manual</span>
                        <div className="flex-grow border-t border-[#E5E5E5]"></div>
                      </div>

                      <form onSubmit={handleSearch} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Buscar Por</label>
                          <select 
                            value={rtfParams.tipo}
                            onChange={e => setRtfParams({...rtfParams, tipo: e.target.value})}
                            className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                          >
                            <option value="1">RTF</option>
                            <option value="2">Expediente</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Nro</label>
                          <input 
                            type="text"
                            value={rtfParams.nro}
                            onChange={e => setRtfParams({...rtfParams, nro: e.target.value})}
                            className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                            placeholder="Ej: 03942"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Sala</label>
                            <select 
                              value={rtfParams.sala}
                              onChange={e => setRtfParams({...rtfParams, sala: e.target.value})}
                              className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                            >
                              {salas.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Año</label>
                            <select 
                              value={rtfParams.anio}
                              onChange={e => setRtfParams({...rtfParams, anio: e.target.value})}
                              className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                            >
                              <option value="">..AÑO..</option>
                              {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Administración</label>
                          <select 
                            value={rtfParams.adm}
                            onChange={e => setRtfParams({...rtfParams, adm: e.target.value})}
                            className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                          >
                            {administraciones.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>

                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full bg-[#DA251C] text-white font-bold py-3 rounded-xl hover:bg-[#B91C1C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                          Buscar
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* SUNAT Search */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E5E5E5] overflow-hidden">
              <button 
                onClick={() => setSearchMode('sunat')}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${
                  searchMode === 'sunat' ? 'bg-[#DA251C] text-white' : 'hover:bg-[#F9F9F9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className={`w-5 h-5 ${searchMode === 'sunat' ? 'text-white' : 'text-[#DA251C]'}`} />
                  <span className="font-bold text-sm tracking-wide">BÚSQUEDA SUNAT</span>
                </div>
                {searchMode === 'sunat' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              <AnimatePresence>
                {searchMode === 'sunat' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 space-y-4 border-t border-[#F0F0F0]">
                      <form onSubmit={handleSunatSearch} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E]">Año a Consultar</label>
                          <select 
                            value={sunatParams.anio}
                            onChange={e => setSunatParams({...sunatParams, anio: e.target.value})}
                            className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#DA251C]"
                          >
                            {Array.from({ length: new Date().getFullYear() - 1996 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>
                        <button 
                          type="submit"
                          disabled={loading}
                          className="w-full bg-[#DA251C] text-white font-bold py-3 rounded-xl hover:bg-[#B91C1C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                          Buscar Documentos
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white rounded-2xl shadow-sm border border-[#E5E5E5] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F0F0F0] flex justify-between items-center bg-[#F9F9F9]">
              <div>
                <h2 className="font-bold text-sm uppercase tracking-wider">Resultados</h2>
                <p className="text-xs text-[#9E9E9E]">
                  {totalResults} resoluciones encontradas 
                  {results.length > 0 && ` (Mostrando ${((currentPage - 1) * 5) + 1} - ${((currentPage - 1) * 5) + results.length})`}
                </p>
              </div>
              <div className="flex gap-2">
                {results.length > 0 && (
                  <button 
                    onClick={uploadAll}
                    disabled={uploadingAll}
                    className="bg-[#141414] text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#333] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingAll ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Subiendo todo...
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        Subir Todo a Drive
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F0F0F0]">
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E] border-b border-[#E5E5E5]">RTF ID</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E] border-b border-[#E5E5E5]">Ruta PDF</th>
                    <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-[#9E9E9E] border-b border-[#E5E5E5] text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {results.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-[#9E9E9E]">
                          {loading ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-8 h-8 animate-spin text-[#DA251C]" />
                              <p className="text-sm font-medium">Buscando en el portal del Tribunal Fiscal...</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <Search className="w-8 h-8 opacity-20" />
                              <p className="text-sm font-medium">No hay resultados para mostrar</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      results.map((result) => (
                        <motion.tr 
                          key={result.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="hover:bg-[#F9F9F9] transition-colors group"
                        >
                          <td className="px-6 py-4 text-sm font-mono font-bold text-[#DA251C] border-b border-[#F0F0F0]">
                            {result.id}
                          </td>
                          <td className="px-6 py-4 text-xs text-[#4A4A4A] border-b border-[#F0F0F0]">
                            {result.path}
                          </td>
                          <td className="px-6 py-4 border-b border-[#F0F0F0] text-right">
                            <div className="flex justify-end gap-2">
                              <a 
                                href={result.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-colors text-[#4A4A4A]"
                                title="Ver PDF"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                              <button 
                                onClick={() => handleUpload(result)}
                                disabled={result.status === 'loading' || result.status === 'success'}
                                className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                                  result.status === 'success' 
                                    ? 'bg-green-50 text-green-600' 
                                    : result.status === 'error'
                                    ? 'bg-red-50 text-red-600'
                                    : 'hover:bg-[#F0F0F0] text-[#141414]'
                                }`}
                              >
                                {result.status === 'loading' ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : result.status === 'success' ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : result.status === 'error' ? (
                                  <AlertCircle className="w-4 h-4" />
                                ) : (
                                  <CloudUpload className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalResults > 0 && (
              <div className="px-6 py-4 bg-[#F9F9F9] border-t border-[#F0F0F0] flex items-center justify-between">
                <div className="text-xs text-[#9E9E9E] font-medium">
                  Página {currentPage} de {Math.ceil(totalResults / 5)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSearch(undefined, currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="p-2 border border-[#E5E5E5] rounded-lg hover:bg-white transition-colors disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSearch(undefined, currentPage + 1)}
                    disabled={currentPage >= Math.ceil(totalResults / 5) || loading}
                    className="p-2 border border-[#E5E5E5] rounded-lg hover:bg-white transition-colors disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-[#F0F0F0] flex justify-between items-center bg-[#F9F9F9]">
                <div className="flex items-center gap-3">
                  <Folder className="w-5 h-5 text-[#DA251C]" />
                  <h2 className="font-bold text-lg">Seleccionar Carpeta</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-[#E5E5E5] rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-4">
                <button 
                  onClick={() => {
                    setFolderId('1bMzh832ZtvEBCC1LaBEGm81AOxueqSfg');
                    setShowSettings(false);
                  }}
                  className={`w-full font-bold py-5 rounded-2xl transition-all text-white text-lg tracking-wider ${
                    folderId === '1bMzh832ZtvEBCC1LaBEGm81AOxueqSfg' 
                      ? 'bg-[#E53935] ring-4 ring-red-200 shadow-lg scale-[1.02]' 
                      : 'bg-[#FF6B6B] hover:bg-[#E53935] hover:shadow-md'
                  }`}
                >
                  INFORMES SUNAT
                </button>
                <button 
                  onClick={() => {
                    setFolderId('1vyRfRrbImxcD5MoK3dBF_ooTC84mPNGt');
                    setShowSettings(false);
                  }}
                  className={`w-full font-bold py-5 rounded-2xl transition-all text-white text-lg tracking-wider ${
                    folderId === '1vyRfRrbImxcD5MoK3dBF_ooTC84mPNGt' 
                      ? 'bg-[#43A047] ring-4 ring-green-200 shadow-lg scale-[1.02]' 
                      : 'bg-[#69F0AE] hover:bg-[#43A047] hover:shadow-md'
                  }`}
                >
                  RTF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
          >
            <AlertCircle className="w-5 h-5" />
            <div className="pr-8">
              <p className="font-bold text-sm">Error en la operación</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
