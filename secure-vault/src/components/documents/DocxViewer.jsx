import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { Loader2, AlertCircle } from 'lucide-react';

const DocxViewer = ({ fileBlobUrl, className = "" }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const renderDocx = async () => {
      if (!fileBlobUrl || !containerRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(fileBlobUrl);
        const blob = await response.blob();
        
        if (!isMounted || !containerRef.current) return;
        
        containerRef.current.innerHTML = '';
        
        await renderAsync(blob, containerRef.current, null, {
          className: "docx-document",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
          renderChanges: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });

        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error("DOCX rendering error:", err);
        if (isMounted) {
          setError("Unable to render Word Document preview. You can still download the file to view it.");
          setLoading(false);
        }
      }
    };

    renderDocx();

    return () => {
      isMounted = false;
    };
  }, [fileBlobUrl]);

  return (
    <div className={`relative w-full h-full overflow-auto bg-slate-950 flex flex-col items-center p-4 ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 z-20 text-slate-300">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
          <p className="text-sm font-medium">Rendering DOCX preview...</p>
        </div>
      )}

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
          <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
          <p className="text-sm max-w-md text-slate-300 mb-2">{error}</p>
        </div>
      ) : (
        <div 
          ref={containerRef} 
          className="docx-container w-full max-w-4xl min-h-full flex flex-col items-center"
        />
      )}
    </div>
  );
};

export default DocxViewer;
