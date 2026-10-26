import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { Button } from '../SharedUI';
import DocxViewer from '../documents/DocxViewer';

const PublicView = () => {
    // 🚀 FIX: URL path se directly shareId extract karein kyunki custom routing use ho rahi hai
    const pathSegments = window.location.pathname.split('/');
    const shareId = pathSegments[pathSegments.length - 1];

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [documentData, setDocumentData] = useState(null);
    const [fileBlobUrl, setFileBlobUrl] = useState(null);

    useEffect(() => {
        const fetchExternalDocument = async () => {
            try {
                const hashToken = window.location.hash ? window.location.hash.substring(1) : null;
                
                if (!hashToken) {
                    throw new Error("Security token is missing from the link URL.");
                }

                if (!shareId) {
                    throw new Error("Share ID is missing from the URL.");
                }

                const response = await api.post(`/share/view/${shareId}`, { token: hashToken });
                const data = response.data;

                setDocumentData(data);

                const binaryString = window.atob(data.fileData);
                const rawData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    rawData[i] = binaryString.charCodeAt(i);
                }

                const mimeMap = {
                    pdf: 'application/pdf',
                    png: 'image/png',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    txt: 'text/plain'
                };
                const mimeType = mimeMap[data.fileType?.toLowerCase()] || 'application/octet-stream';

                const blob = new Blob([rawData], { type: mimeType });
                const blobUrl = window.URL.createObjectURL(blob);
                setFileBlobUrl(blobUrl);

            } catch (err) {
                console.error("Public view error:", err);
                setError(err.response?.data?.error || err.message || "Failed to load shared document.");
            } finally {
                setLoading(false);
            }
        };

        fetchExternalDocument();
    }, [shareId]);

    const handleDownload = () => {
        if (!fileBlobUrl || !documentData) return;
        const link = document.createElement('a');
        link.href = fileBlobUrl;
        link.setAttribute('download', documentData.fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-sm">Verifying secure link & loading document...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center space-y-4 shadow-xl">
                    <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-100">Access Restricted</h2>
                    <p className="text-sm text-slate-400">{error}</p>
                    <p className="text-xs text-slate-600">The link might have expired, been revoked, or the URL is invalid.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Top Header Bar */}
            <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold text-slate-200">{documentData?.fileName}</h1>
                        <p className="text-xs text-slate-400">Shared securely by <span className="text-slate-200 font-medium">{documentData?.ownerName}</span> via SecureVault</p>
                    </div>
                </div>
                <Button variant="primary" icon={Download} onClick={handleDownload}>
                    Download File
                </Button>
            </header>

            {/* Document Preview Area */}
            <main className="flex-1 p-6 flex items-center justify-center">
                <div className="w-full max-w-5xl h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                    {documentData?.fileType?.toLowerCase() === 'docx' ? (
                        <DocxViewer fileBlobUrl={fileBlobUrl} />
                    ) : ['pdf', 'txt', 'html', 'json', 'csv', 'xml', 'md', 'js', 'py', 'java', 'c', 'cpp', 'css'].includes(documentData?.fileType?.toLowerCase()) ? (
                        <iframe src={fileBlobUrl} className="w-full h-full border-0 bg-white" title="Document Viewer" />
                    ) : ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'].includes(documentData?.fileType?.toLowerCase()) ? (
                        <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                            <img src={fileBlobUrl} alt="Shared Preview" className="max-h-full max-w-full object-contain rounded-lg shadow-lg" />
                        </div>
                    ) : ['mp4', 'webm', 'ogg', 'mov'].includes(documentData?.fileType?.toLowerCase()) ? (
                        <div className="w-full h-full flex items-center justify-center bg-black">
                            <video src={fileBlobUrl} controls className="max-w-full max-h-full outline-none" />
                        </div>
                    ) : ['mp3', 'wav', 'm4a'].includes(documentData?.fileType?.toLowerCase()) ? (
                        <div className="w-full h-full flex items-center justify-center p-8 bg-slate-900">
                            <audio src={fileBlobUrl} controls className="w-full max-w-md" />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-3 p-6 text-center">
                            <FileText className="w-16 h-16 text-slate-600" />
                            <p className="text-sm">Preview not available for <code>.{documentData?.fileType}</code> files.</p>
                            <Button variant="outline" icon={Download} onClick={handleDownload}>Download to view</Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PublicView;