import React, { useState, useEffect } from 'react';
import { transportLineService } from '../services/transportLineService';
import { asignacionCajaService } from '../services/asignacionCajaService';
import { checkInService } from '../services/checkInService';
import { TransportLineModel } from '../types/transportLine';
import { AsignacionCajaModel } from '../types/asignacionCaja';
import { CheckCircle2, AlertCircle, ArrowRight, Truck, Calendar as CalendarIcon, Clock, XCircle, Box, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const DriverCheckIn = () => {
  const getLocalDate = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [carrierRef, setCarrierRef] = useState('');
  const [searchDate, setSearchDate] = useState(getLocalDate());
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'INITIAL' | 'MATCH' | 'SUCCESS' | 'ERROR_NO_MATCH' | 'MANUAL_FORM'>('INITIAL');
  const [asignacion, setAsignacion] = useState<AsignacionCajaModel | null>(null);
  const [tlNumber, setTlNumber] = useState('');

  const [transportLines, setTransportLines] = useState<TransportLineModel[]>([]);
  const [selectedTransportId, setSelectedTransportId] = useState('');
  const [tlSearchTerm, setTlSearchTerm] = useState('');
  const [showTlDropdown, setShowTlDropdown] = useState(false);
  const [numeroCaja, setNumeroCaja] = useState('');
  const [placasTracto, setPlacasTracto] = useState('');
  const [numeroTracto, setNumeroTracto] = useState('');
  const [nombreDriver, setNombreDriver] = useState('');
  const [expectedDate, setExpectedDate] = useState('');

  useEffect(() => {
    // Fetch transport lines for the manual form dropdown
    const fetchTLs = async () => {
      try {
        const data = await transportLineService.getAllTransportLines();
        setTransportLines(data.filter(t => (t as any).isActive !== false));
      } catch (e) {
        console.error('Error fetching transport lines:', e);
      }
    };
    fetchTLs();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = carrierRef.trim();
    if (!ref) return;

    setLoading(true);
    try {
      const match = await asignacionCajaService.getAsignacionByCarrierRef(ref, searchDate);
      if (match) {
        setAsignacion(match);
        setStep('MATCH');
      } else {
        setStep('ERROR_NO_MATCH');
      }
    } catch (e) {
      console.error(e);
      alert('Ocurrió un error al buscar la cita.');
    } finally {
      setLoading(false);
    }
  };

  const extractTL = (numeroOperacion: string | undefined) => {
    if (!numeroOperacion) return 'S/N';
    const match = numeroOperacion.match(/(TL\d{3})/i);
    return match ? match[1].toUpperCase() : numeroOperacion.substring(0, 5).toUpperCase();
  };

  const getNowTime = () => {
    const now = new Date();
    return now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Mexico_City'
    });
  };

  const handleConfirm = async () => {
    if (!asignacion || !asignacion.id) return;
    setLoading(true);
    try {
      const checkInAt = new Date().toISOString();
      const checkInStatus = 'PUNTUAL / OK';

      const matchTl = transportLines.find(t => t.transportLineId === asignacion.transportLineId) || transportLines.find(t => t.carrierCodigo === asignacion.carrierCodigo) || transportLines.find(t => t.carrierCodigo === asignacion.scac);
      const lineaName = matchTl ? (matchTl.nombreSubLinea || matchTl.TransportLine) : (asignacion.transportista || '');
      const scacName = asignacion.scac || asignacion.carrierCodigo || (matchTl ? matchTl.carrierCodigo : '');

      await checkInService.createCheckIn({
        asignacionCajaId: asignacion.id || null,
        numeroOperacion: asignacion.numeroOperacion || 'S/N',
        carrierRef: asignacion.carrierRef || carrierRef.trim().toUpperCase(),
        checkInAt,
        checkInStatus,
        numeroCaja: asignacion.numeroCaja || 'S/N',
        placasTracto: asignacion.placasTracto || '',
        numeroTracto: '', // Original appt doesn't have this explicitly yet
        nombreDriver: asignacion.nombreDriver || '',
        fechaAgendada: asignacion.fecha || '',
        horaAgendada: asignacion.horaAsignacion || '',
        scac: scacName,
        transportista: lineaName,
        processed: false
      });

      setTlNumber(extractTL(asignacion.numeroOperacion));
      setStep('SUCCESS');
    } catch (error) {
      console.error(error);
      alert('Ocurrió un error al registrar el arribo.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = () => {
    setStep('MANUAL_FORM');
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransportId) {
      alert('Por favor selecciona una línea de transporte válida de la lista desplegable.');
      return;
    }
    if (!selectedTransportId || !numeroCaja.trim()) {
      alert('Por favor completa al menos la Línea de Transporte y el Número de Caja.');
      return;
    }

    setLoading(true);
    try {
      const tl = transportLines.find(t => t.transportLineId === selectedTransportId);
      const scac = tl?.carrierCodigo || '';
      const subLine = tl?.TransportLine || '';

      let windowAppointments = [];
      if (expectedDate) {
        // Si especificaron fecha, buscar solo en ese día para ser exactos
        windowAppointments = await asignacionCajaService.getAsignacionesByDate(expectedDate);
      } else {
        const todayObj = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
        
        const futureDate = new Date(todayObj);
        futureDate.setDate(futureDate.getDate() + 2); // Buscar hasta 2 días adelante

        const pad = (n: number) => n.toString().padStart(2, '0');
        const startStr = `${todayObj.getFullYear()}-${pad(todayObj.getMonth() + 1)}-${pad(todayObj.getDate())}`;
        const endStr = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;
        windowAppointments = await asignacionCajaService.getAsignacionesByDateRange(startStr, endStr);
      }
      
      // Intentar encontrar coincidencia fuerte primero (Caja o Placas)
      let partialMatch = windowAppointments.find(a => 
        (a.numeroCaja?.toUpperCase() === numeroCaja.trim().toUpperCase()) ||
        (placasTracto && a.placasTracto?.toUpperCase() === placasTracto.trim().toUpperCase())
      );

      const checkInAt = new Date().toISOString();

      if (partialMatch && partialMatch.id) {
        // Todas las citas manuales que encuentran coincidencia deben pasar a validación
        const checkInStatus = 'CITA CON POSIBLE ERROR';
        
        await checkInService.createCheckIn({
          asignacionCajaId: partialMatch.id || null,
          numeroOperacion: partialMatch.numeroOperacion || 'S/N',
          carrierRef: partialMatch.carrierRef || 'S/N',
          checkInAt,
          checkInStatus,
          numeroCaja: numeroCaja.trim().toUpperCase(),
          placasTracto: placasTracto.trim().toUpperCase() || '',
          numeroTracto: numeroTracto.trim().toUpperCase() || '',
          nombreDriver: nombreDriver.trim().toUpperCase() || partialMatch.nombreDriver || '',
          fechaAgendada: partialMatch.fecha || '',
          horaAgendada: partialMatch.horaAsignacion || '',
          scac: partialMatch.scac || partialMatch.carrierCodigo || tl?.carrierCodigo || '',
          transportista: tl?.nombreSubLinea || tl?.TransportLine || partialMatch.transportista || '',
          processed: false
        });
        
        const isExactMatch = 
          partialMatch.carrierCodigo === scac &&
          partialMatch.numeroCaja?.toUpperCase() === numeroCaja.trim().toUpperCase() &&
          (!placasTracto.trim() || partialMatch.placasTracto?.toUpperCase() === placasTracto.trim().toUpperCase()) &&
          (!expectedDate || partialMatch.fecha === expectedDate);

        if (isExactMatch) {
          setTlNumber(extractTL(partialMatch.numeroOperacion));
          setStep('SUCCESS');
        } else {
          alert('Cita con posible error o datos inconsistentes, solicita correccion de cita con linea transportista');
          window.location.reload();
        }
      } else {
        // SIN CITA
        await checkInService.createCheckIn({
          asignacionCajaId: null,
          numeroOperacion: 'SIN CITA',
          carrierRef: 'SIN CITA',
          checkInAt,
          checkInStatus: 'SIN CITA',
          numeroCaja: numeroCaja.trim().toUpperCase(),
          placasTracto: placasTracto.trim().toUpperCase() || '',
          numeroTracto: numeroTracto.trim().toUpperCase() || '',
          nombreDriver: nombreDriver.trim().toUpperCase() || '',
          scac: subLine || '',
          transportista: tl?.nombreSubLinea || tl?.TransportLine || '',
          processed: false
        });
        alert('Sin cita. Solicita cita a linea transportista');
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      alert('Ocurrió un error de conexión.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-x-hidden w-full max-w-[100vw]">
      {/* Header */}
      <div className="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-10 flex items-center justify-center shadow-lg">
        <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          <Truck className="text-indigo-500" />
          CFMOTO <span className="font-light text-slate-400">| CHECK-IN</span>
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        
        {step === 'INITIAL' && (
          <div className="w-full max-w-md space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Bienvenido</h2>
              <p className="text-slate-400 text-lg">Ingresa tu código de reservación (Carrier Reference) para registrar tu llegada.</p>
            </div>
            
            <form onSubmit={handleSearch} className="space-y-6 bg-slate-800/50 p-4 sm:p-6 rounded-2xl border border-slate-700/50 shadow-xl backdrop-blur-sm">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
                  <CalendarIcon size={16} className="text-slate-400" /> Fecha de la cita
                </label>
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="block w-full min-w-0 appearance-none bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Carrier Reference</label>
                <input
                  type="text"
                  value={carrierRef}
                  onChange={(e) => setCarrierRef(e.target.value.toUpperCase())}
                  placeholder="ej. CFM-26CFTTN-0123"
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-4 text-white text-lg font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase placeholder:text-slate-600"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !carrierRef.trim() || !searchDate}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/20"
              >
                {loading ? 'Buscando...' : 'Buscar Cita'}
                {!loading && <ArrowRight />}
              </button>
            </form>

            <button 
              onClick={() => setStep('MANUAL_FORM')}
              className="w-full text-center text-slate-500 mt-6 text-sm underline hover:text-slate-300"
            >
              No tengo código de reservación
            </button>
          </div>
        )}

        {step === 'MATCH' && asignacion && (
          <div className="w-full max-w-md space-y-6">
            <div className="bg-indigo-950/30 border border-indigo-500/30 p-6 rounded-2xl shadow-xl backdrop-blur-sm mb-6">
              <h3 className="text-xl font-bold text-indigo-400 mb-4 text-center">Cita Encontrada</h3>
              
              <div className="space-y-4 text-left">
                {(() => {
                  const matchTl = transportLines.find(t => t.transportLineId === asignacion.transportLineId) || transportLines.find(t => t.carrierCodigo === asignacion.carrierCodigo) || transportLines.find(t => t.carrierCodigo === asignacion.scac);
                  const lineaName = matchTl ? (matchTl.nombreSubLinea || matchTl.TransportLine) : (asignacion.transportista || asignacion.scac || 'N/A');
                  const scacName = asignacion.scac || asignacion.carrierCodigo || (matchTl ? matchTl.carrierCodigo : 'N/A');
                  
                  return (
                    <>
                      <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                        <CalendarIcon className="text-slate-400" size={20} />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Fecha Agendada</p>
                          <p className="font-semibold text-slate-200">{asignacion.fecha}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                        <Clock className="text-slate-400" size={20} />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Hora Asignada</p>
                          <p className="font-semibold text-slate-200">{asignacion.horaAsignacion || 'Por definir'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                        <Truck className="text-slate-400" size={20} />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Línea de Transporte</p>
                          <p className="font-semibold text-slate-200">{lineaName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                        <Truck className="text-slate-400" size={20} />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">SCAC</p>
                          <p className="font-semibold text-slate-200">{scacName}</p>
                        </div>
                      </div>
                    </>
                  );
                })()}
                <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                  <FileText className="text-slate-400" size={20} />
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Carrier Reference</p>
                    <p className="font-semibold text-slate-200">{asignacion.carrierRef || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                  <Box className="text-slate-400" size={20} />
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Número de Caja / Equipo</p>
                    <p className="font-semibold text-slate-200">{asignacion.numeroCaja}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                  <Truck className="text-slate-400" size={20} />
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Placas del Tractocamión</p>
                    <p className="font-semibold text-slate-200">{asignacion.placasTracto || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">Conductor asignado</p>
                    <p className="font-semibold text-slate-200">{asignacion.nombreDriver || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white mb-2">¿Son estos tus datos?</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleReject}
                disabled={loading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-600"
              >
                <XCircle size={20} /> NO
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
              >
                {loading ? '...' : <><CheckCircle2 size={20} /> SÍ</>}
              </button>
            </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="w-full max-w-md text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Check-in Exitoso</h2>
              <p className="text-slate-400 text-lg mb-8">Tu llegada ha sido registrada en el sistema. Por favor, toma asiento y espera indicaciones en rampa.</p>
            </div>
            
            <div className="bg-slate-800/80 p-8 rounded-2xl border border-slate-700">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2">No. Operación</p>
              <div className="text-5xl font-black text-white tracking-tight">{tlNumber}</div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="mt-8 text-slate-500 underline hover:text-slate-300"
            >
              Registrar otra llegada
            </button>
          </div>
        )}

        {(step === 'ERROR_NO_MATCH' || step === 'MANUAL_FORM') && (
          <div className="w-full max-w-md space-y-6">
            {step === 'ERROR_NO_MATCH' && (
               <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-center mb-6">
                 <AlertCircle className="mx-auto text-red-500 mb-2" size={32} />
                 <h3 className="font-bold text-red-400 mb-1">Cita No Encontrada</h3>
                 <p className="text-sm text-red-300/80">No encontramos ninguna reservación con ese código. Por favor completa los siguientes datos.</p>
               </div>
            )}

            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white">Registro Manual</h2>
              <p className="text-slate-400 text-sm mt-1">Buscaremos tu cita mediante tus datos de transporte.</p>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 shadow-xl backdrop-blur-sm">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Fecha de Cita (Opcional)</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="block w-full min-w-0 appearance-none bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-300 mb-2">Línea de Transporte</label>
                <input
                  type="text"
                  placeholder="Buscar línea de transporte..."
                  value={tlSearchTerm}
                  onChange={(e) => {
                    setTlSearchTerm(e.target.value);
                    setSelectedTransportId('');
                    setShowTlDropdown(true);
                  }}
                  onFocus={() => setShowTlDropdown(true)}
                  onBlur={() => {
                    // Small delay to allow click on dropdown to register
                    setTimeout(() => setShowTlDropdown(false), 200);
                  }}
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
                
                {showTlDropdown && (
                  <ul className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-slate-800 border border-slate-600 rounded-xl shadow-2xl">
                    {transportLines.filter(tl => 
                      ((tl.TransportLine || '') + ' ' + (tl.razonSocial || '') + ' ' + (tl.nombreSubLinea || '') + ' ' + (tl.lineaMexicana || '') + ' ' + (tl.carrierCodigo || '')).toLowerCase().includes(tlSearchTerm.toLowerCase())
                    ).map(tl => (
                      <li
                        key={tl.transportLineId}
                        onClick={() => {
                          setSelectedTransportId(tl.transportLineId);
                          setTlSearchTerm(tl.nombreSubLinea || tl.TransportLine || tl.razonSocial);
                          setShowTlDropdown(false);
                        }}
                        className="px-4 py-3 cursor-pointer hover:bg-slate-700 text-slate-200 border-b border-slate-700/50 last:border-0"
                      >
                        {tl.nombreSubLinea || tl.TransportLine || tl.razonSocial} <span className="text-slate-400 text-sm ml-1">({tl.carrierCodigo})</span>
                      </li>
                    ))}
                    {transportLines.filter(tl => 
                      ((tl.TransportLine || '') + ' ' + (tl.razonSocial || '') + ' ' + (tl.nombreSubLinea || '') + ' ' + (tl.lineaMexicana || '') + ' ' + (tl.carrierCodigo || '')).toLowerCase().includes(tlSearchTerm.toLowerCase())
                    ).length === 0 && (
                      <li className="px-4 py-3 text-slate-500 text-sm">No se encontraron líneas...</li>
                    )}
                  </ul>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Equipo / Número de Caja</label>
                <input
                  type="text"
                  value={numeroCaja}
                  onChange={(e) => setNumeroCaja(e.target.value.toUpperCase())}
                  placeholder="Ej. CAJA-123"
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Nombre del Chofer (Opcional)</label>
                <input
                  type="text"
                  value={nombreDriver}
                  onChange={(e) => setNombreDriver(e.target.value.toUpperCase())}
                  placeholder="Ej. JUAN PEREZ"
                  className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Tracto (Opcional)</label>
                  <input
                    type="text"
                    value={numeroTracto}
                    onChange={(e) => setNumeroTracto(e.target.value.toUpperCase())}
                    placeholder="Ej. TR-01"
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Placas (Opcional)</label>
                  <input
                    type="text"
                    value={placasTracto}
                    onChange={(e) => setPlacasTracto(e.target.value.toUpperCase())}
                    placeholder="Ej. 123-AB"
                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono focus:outline-none focus:border-indigo-500 transition-colors uppercase"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-4 disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar Datos'}
              </button>
            </form>

            <button 
              onClick={() => setStep('INITIAL')}
              className="w-full text-center text-slate-500 mt-6 text-sm underline hover:text-slate-300"
            >
              Volver atrás
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
