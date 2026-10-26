import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Type, PenTool, ImageIcon, RefreshCw, Key, Move, FileText, ChevronLeft, ChevronRight, Sliders, Loader2 } from 'lucide-react';
import { Modal, Button } from '../SharedUI';
import api from '../../api/axiosConfig';
import { useToast } from '../ToastContext';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SignModal = ({ isOpen, onClose, doc, fileBlobUrl, onSignedSuccess }) => {
  const { addToast } = useToast();
  const [tab, setTab] = useState('type');
  const [signatureText, setSignatureText] = useState('');
  const [pin, setPin] = useState('');
  const [signing, setSigning] = useState(false);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);
  const [drawnImageBase64, setDrawnImageBase64] = useState(null);
  
  // Signature Sizing State (0.5x to 2.0x scale relative to standard 150pt width)
  const [imageScale, setImageScale] = useState(1.0);

  // PDF Multi-page & Viewport Rendering States
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(1);
  const [targetPage, setTargetPage] = useState(1);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [pageViewport, setPageViewport] = useState({
    width: 300,
    height: 424,
    scale: 0.5,
    pdfWidth: 595,
    pdfHeight: 842
  });

  // Interactive Positioning States
  const [position, setPosition] = useState({ x: 140, y: 320 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const containerRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // --- 1. LOAD PDF DOCUMENT WITH PDF.JS ---
  useEffect(() => {
    if (!isOpen) {
      setPdfDoc(null);
      setNumPages(1);
      setTargetPage(1);
      return;
    }

    let isMounted = true;
    const loadPdfDocument = async () => {
      try {
        let arrayBuffer = null;
        if (fileBlobUrl) {
          const response = await fetch(fileBlobUrl);
          arrayBuffer = await response.arrayBuffer();
        } else if (doc && !doc.encrypted && doc.id) {
          const response = await api.post(`/vault/${doc.id}/download`, {}, { responseType: 'arraybuffer' });
          arrayBuffer = response.data;
        }

        if (!arrayBuffer || !isMounted) return;

        // Use direct Uint8Array for bulletproof worker parsing of all pages
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const loadedPdf = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(loadedPdf);
          setNumPages(loadedPdf.numPages || 1);
          setTargetPage(1);
        }
      } catch (err) {
        console.error("Failed to load PDF in SignModal:", err);
      }
    };

    loadPdfDocument();
    return () => { isMounted = false; };
  }, [isOpen, fileBlobUrl, doc?.id]);

  // --- 2. RENDER ACTIVE PDF PAGE TO CANVAS ---
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !pdfCanvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {}
    }

    setIsRenderingPage(true);

    try {
      const page = await pdfDoc.getPage(targetPage);
      const unscaled = page.getViewport({ scale: 1.0 });

      // Target display height in modal viewport (420px fits comfortably without scrolling)
      const targetDisplayHeight = 420;
      const displayScale = targetDisplayHeight / unscaled.height;
      const viewport = page.getViewport({ scale: displayScale });

      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      // Use devicePixelRatio for crisp text rendering
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      ctx.save();
      ctx.scale(dpr, dpr);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      ctx.restore();

      const newViewport = {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        scale: displayScale,
        pdfWidth: unscaled.width,
        pdfHeight: unscaled.height
      };
      setPageViewport(newViewport);

      // Reposition signature to bottom-right if currently out of bounds
      const stampW = Math.round(150 * imageScale * displayScale);
      const stampH = Math.round(55 * imageScale * displayScale);
      setPosition(prev => ({
        x: Math.max(0, Math.min(prev.x, newViewport.width - stampW)),
        y: Math.max(0, Math.min(prev.y, newViewport.height - stampH))
      }));

    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error("Error rendering page to canvas:", err);
      }
    } finally {
      setIsRenderingPage(false);
    }
  }, [pdfDoc, targetPage, imageScale]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // --- 3. DRAWING CANVAS SETUP ---
  useEffect(() => {
    if (tab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight || 130;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [tab]);

  // --- 4. SIGNATURE STAMP DISPLAY DIMENSIONS ---
  // Standard signature size is ~150 x 55 PDF points.
  // We scale it by (imageScale * pageViewport.scale) so it visually matches the rendered document.
  const stampWidth = Math.max(60, Math.round(150 * imageScale * (pageViewport.scale || 0.5)));
  const stampHeight = Math.max(25, Math.round(55 * imageScale * (pageViewport.scale || 0.5)));

  // --- 5. DRAGGING MECHANICS ON LIVE DOCUMENT ---
  const handleMouseDown = (e) => {
    e.stopPropagation();
    setIsDragging(true);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDragOffset({
        x: (e.clientX - rect.left) - position.x,
        y: (e.clientY - rect.top) - position.y
      });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let newX = (e.clientX - rect.left) - dragOffset.x;
    let newY = (e.clientY - rect.top) - dragOffset.y;

    // Strict boundary clamping within the rendered document page
    newX = Math.max(0, Math.min(newX, pageViewport.width - stampWidth));
    newY = Math.max(0, Math.min(newY, pageViewport.height - stampHeight));

    setPosition({ x: Math.round(newX), y: Math.round(newY) });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // --- 6. HAND DRAWING LOGIC ---
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      setDrawnImageBase64(canvasRef.current.toDataURL('image/png'));
    }
  };
  
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setDrawnImageBase64(null);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setUploadedImageBase64(uploadEvent.target.result);
      addToast("Signature image loaded successfully!", "success");
    };
    reader.readAsDataURL(file);
  };

  // --- 7. TYPED SIGNATURE GENERATOR (CUSTOM FONT: ALLURA) ---
  const getTypedSignatureBase64 = async () => {
    try {
      // Ensure the Allura font is completely loaded before painting canvas
      await document.fonts.load("72px 'Allura'");
    } catch (e) {
      console.warn("Font loading fallback:", e);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw in the requested "Allura" cursive font
    ctx.font = "76px 'Allura', cursive";
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(signatureText || "Authorized Signature", canvas.width / 2, canvas.height / 2);
    
    return canvas.toDataURL('image/png');
  };

  // --- 8. SUBMIT DIGITAL SIGNATURE ---
  const handleSignSubmit = async () => {
    if (!pin) {
      addToast("Master PIN is required to sign.", "error");
      return;
    }

    let finalSignatureImage = '';
    if (tab === 'type') {
      finalSignatureImage = await getTypedSignatureBase64();
    } else if (tab === 'draw') {
      finalSignatureImage = drawnImageBase64 || (canvasRef.current ? canvasRef.current.toDataURL('image/png') : '');
    } else if (tab === 'upload') {
      finalSignatureImage = uploadedImageBase64;
    }

    if (!finalSignatureImage) {
      addToast("Please provide or draw a signature before applying.", "error");
      return;
    }

    setSigning(true);
    try {
      const response = await api.post(`/documents/${doc.id}/sign`, {
        pin: pin,
        signatureImage: finalSignatureImage,
        pageNumber: targetPage,
        positionX: position.x,
        positionY: position.y,
        pdfViewerWidth: pageViewport.width,
        pdfViewerHeight: pageViewport.height,
        imageScale: imageScale
      });

      addToast(response.data.message || "Document successfully signed and stamped!", "success");
      if (onSignedSuccess) {
        onSignedSuccess(doc.id, pin);
      }
      onClose();
    } catch (error) {
      console.error("Signing failed:", error);
      addToast(error.response?.data?.error || "Failed to digitally sign document.", "error");
    } finally {
      setSigning(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Interactive Document Signing Workspace" maxWidth="max-w-2xl">
      {/* Signature Input Mode Selection */}
      <div className="mb-3 flex border-b border-slate-800">
        <button onClick={() => setTab('type')} className={`pb-2 px-4 text-sm font-medium transition-colors ${tab === 'type' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400'}`}><Type className="w-4 h-4 inline mr-1"/> Type</button>
        <button onClick={() => setTab('draw')} className={`pb-2 px-4 text-sm font-medium transition-colors ${tab === 'draw' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400'}`}><PenTool className="w-4 h-4 inline mr-1"/> Draw</button>
        <button onClick={() => setTab('upload')} className={`pb-2 px-4 text-sm font-medium transition-colors ${tab === 'upload' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400'}`}><ImageIcon className="w-4 h-4 inline mr-1"/> Upload Image</button>
      </div>

      {/* Signature Input Tool Area */}
      <div className="bg-slate-900/60 rounded-lg p-3 mb-3 border border-slate-800">
        {tab === 'type' && (
          <div>
            <input 
              type="text" 
              placeholder="Type your signature"
              value={signatureText} 
              onChange={(e) => setSignatureText(e.target.value)}
              className="bg-transparent border-b border-slate-700 text-center font-allura text-4xl text-emerald-400 focus:outline-none focus:border-emerald-500 w-full pb-1 tracking-wide"
            />
            <p className="text-[11px] text-slate-500 text-center mt-1">Font: <span className="font-semibold text-slate-400">Allura Cursive Script</span></p>
          </div>
        )}
        {tab === 'draw' && (
          <div className="flex flex-col items-center">
            <canvas 
              ref={canvasRef} 
              onMouseDown={startDrawing} 
              onMouseMove={draw} 
              onMouseUp={stopDrawing} 
              onMouseLeave={stopDrawing} 
              className="w-full h-24 bg-white rounded cursor-crosshair border border-slate-800" 
            />
            <button type="button" onClick={clearCanvas} className="mt-1 text-xs text-slate-400 hover:text-red-400 underline self-end">Clear Canvas</button>
          </div>
        )}
        {tab === 'upload' && (
          <div className="text-center py-1">
            <input type="file" accept="image/*" onChange={handleFileUpload} className="text-xs text-slate-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20" />
          </div>
        )}
      </div>

      {/* Signature Sizing & Live Dimensions Control */}
      <div className="flex items-center justify-between bg-slate-900/40 px-3 py-2 rounded-lg border border-slate-800 mb-3 text-xs">
        <div className="flex items-center space-x-2 flex-1 mr-4">
          <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-slate-300 font-medium">Signature Size:</span>
          <input 
            type="range" 
            min="0.5" 
            max="2.0" 
            step="0.1" 
            value={imageScale} 
            onChange={(e) => setImageScale(parseFloat(e.target.value))}
            className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
          />
          <span className="font-mono text-emerald-400 w-10 text-right">{imageScale.toFixed(1)}x</span>
        </div>
        <div className="text-slate-400 font-mono text-[11px] shrink-0 border-l border-slate-800 pl-3">
          Dimensions: <span className="text-slate-200 font-semibold">{Math.round(150 * imageScale)} × {Math.round(55 * imageScale)} pt</span>
        </div>
      </div>

      {/* Target Page Navigation & Selector Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-slate-300 flex items-center">
            <FileText className="w-4 h-4 mr-1.5 text-emerald-400" /> Sign on Page:
          </span>
          <select 
            value={targetPage} 
            onChange={(e) => setTargetPage(parseInt(e.target.value, 10))}
            disabled={isRenderingPage || numPages <= 1}
            className="bg-slate-800 text-emerald-400 font-semibold text-xs py-1 px-2.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pg) => (
              <option key={pg} value={pg} className="bg-slate-900 text-slate-200">
                Page {pg} {pg === 1 ? '(First Page)' : pg === numPages ? '(Last Page)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1.5 ml-auto">
          {numPages > 2 && (
            <button
              type="button"
              onClick={() => setTargetPage(1)}
              disabled={targetPage === 1 || isRenderingPage}
              className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 text-[11px]"
              title="Jump to first page"
            >
              First
            </button>
          )}
          <button 
            type="button"
            onClick={() => setTargetPage(p => Math.max(1, p - 1))}
            disabled={targetPage <= 1 || isRenderingPage}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4"/>
          </button>
          <span className="font-semibold text-slate-300 min-w-[75px] text-center text-xs">
            {targetPage} / {numPages}
          </span>
          <button 
            type="button"
            onClick={() => setTargetPage(p => Math.min(numPages, p + 1))}
            disabled={targetPage >= numPages || isRenderingPage}
            className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4"/>
          </button>
          {numPages > 2 && (
            <button
              type="button"
              onClick={() => setTargetPage(numPages)}
              disabled={targetPage === numPages || isRenderingPage}
              className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 text-[11px]"
              title="Jump to last page"
            >
              Last
            </button>
          )}
        </div>
      </div>

      {/* Placement Helper Header */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-1.5">
        <span>Drag signature directly onto the desired position on the document:</span>
        <span className="text-emerald-400 flex items-center font-mono text-[11px]">
          <Move className="w-3 h-3 mr-1"/> 
          X: {pageViewport.width ? Math.round((position.x / pageViewport.width) * 100) : 50}% • 
          Y: {pageViewport.height ? Math.round((position.y / pageViewport.height) * 100) : 80}%
        </span>
      </div>

      {/* Live PDF Document Canvas Workspace */}
      <div 
        className="w-full bg-slate-950/90 rounded-xl p-3 border border-slate-800 flex items-center justify-center overflow-hidden min-h-[380px]"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div 
          ref={containerRef}
          style={{ 
            width: `${pageViewport.width}px`, 
            height: `${pageViewport.height}px` 
          }}
          className="relative bg-white rounded shadow-2xl border border-slate-300 overflow-hidden select-none"
        >
          {/* Loading Indicator while page renders */}
          {isRenderingPage && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-10">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
            </div>
          )}

          {/* Actual PDF Page Canvas */}
          <canvas ref={pdfCanvasRef} className="block w-full h-full pointer-events-none" />

          {/* Fallback Skeleton if fileBlobUrl is not yet present */}
          {!fileBlobUrl && (
            <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none bg-slate-50">
              <div className="space-y-2">
                <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 mb-2">
                  <span className="text-[10px] font-bold text-slate-600 truncate max-w-[170px]">{doc?.name || 'Document'}</span>
                  <span className="text-[9px] font-mono text-slate-400">Pg {targetPage}</span>
                </div>
                <div className="h-2 bg-slate-300 rounded w-4/5"></div>
                <div className="h-2 bg-slate-200 rounded w-full"></div>
                <div className="h-2 bg-slate-200 rounded w-11/12"></div>
                <div className="h-2 bg-slate-200 rounded w-5/6"></div>
              </div>
              <div className="border border-dashed border-emerald-400/60 bg-emerald-50/50 rounded p-2 text-center text-[10px] text-emerald-700 font-medium">
                Signature Placement Zone (Page {targetPage})
              </div>
            </div>
          )}

          {/* Draggable & Faithfully Scaled Signature Stamp */}
          <div 
            onMouseDown={handleMouseDown}
            style={{ 
              left: `${position.x}px`, 
              top: `${position.y}px`,
              width: `${stampWidth}px`,
              height: `${stampHeight}px`
            }}
            className="absolute cursor-grab active:cursor-grabbing border-2 border-dashed border-emerald-600 bg-white/95 rounded shadow-lg flex items-center justify-center p-1 group z-30 select-none transition-shadow hover:shadow-emerald-500/20"
          >
            <div className="absolute -top-2 -right-2 bg-emerald-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <Move className="w-2.5 h-2.5" />
            </div>

            {tab === 'type' && (
              <span 
                className="font-allura text-slate-900 leading-none select-none text-center truncate px-1 font-semibold"
                style={{ fontSize: `${Math.max(14, Math.round(28 * imageScale * (pageViewport.scale || 0.5)))}px` }}
              >
                {signatureText || "Authorized Signature"}
              </span>
            )}

            {tab === 'draw' && (
              drawnImageBase64 ? (
                <img src={drawnImageBase64} alt="Signature" className="w-full h-full object-contain pointer-events-none" />
              ) : (
                <span className="text-[9px] text-emerald-700 font-semibold whitespace-nowrap">[ Draw Signature Above ]</span>
              )
            )}

            {tab === 'upload' && (
              uploadedImageBase64 ? (
                <img src={uploadedImageBase64} alt="Stamp" className="w-full h-full object-contain pointer-events-none" />
              ) : (
                <span className="text-[9px] text-emerald-700 font-semibold whitespace-nowrap">[ Upload Image Above ]</span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Master PIN Authentication */}
      <div className="mb-4 mt-3">
        <label className="block text-sm font-medium text-slate-300 mb-1">Master PIN (Required to sign & encrypt)</label>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-emerald-400" />
          <input 
            type="password" 
            maxLength={6}
            value={pin} 
            onChange={(e) => setPin(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            placeholder="Enter 6-digit Master PIN"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
        <Button variant="ghost" onClick={onClose} disabled={signing}>Cancel</Button>
        <Button variant="primary" onClick={handleSignSubmit} disabled={signing || !pin} icon={signing ? RefreshCw : PenTool} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          {signing ? 'Stamping & Signing...' : 'Apply Signature'}
        </Button>
      </div>
    </Modal>
  );
};

export default SignModal;