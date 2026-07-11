"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  Send,
  FileText,
  Loader2,
  Bot,
  User,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  FileSearch,
  Database,
  Layers,
  Info,
  ExternalLink,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface Citation {
  citation_id: string;
  source_file: string;
  page_number: number;
  chunk_text: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  citations?: Citation[];
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "knowledge">("chat");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check backend health and load documents from localStorage
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/`);
        if (res.ok) {
          setBackendOnline(true);
        } else {
          setBackendOnline(false);
        }
      } catch {
        setBackendOnline(false);
      }
    };
    checkBackend();

    const storedDocs = localStorage.getItem("rag_uploaded_docs");
    if (storedDocs) {
      try {
        setUploadedDocs(JSON.parse(storedDocs));
      } catch {
        // Ignore parsing errors
      }
    }
  }, []);

  // Auto-scroll chat to the bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file) => file.type === "application/pdf" || file.name.endsWith(".pdf")
      );
      if (droppedFiles.length > 0) {
        setFiles((prev) => [...prev, ...droppedFiles]);
      } else {
        showError("Only PDF files are supported.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type === "application/pdf" || file.name.endsWith(".pdf")
      );
      if (selectedFiles.length > 0) {
        setFiles((prev) => [...prev, ...selectedFiles]);
      }
    }
  };

  const removeSelectedFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 8000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 8000);
  };

  // Upload PDFs to backend
  const uploadFiles = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to upload files.");
      }

      const data = await res.json();
      const newlyUploaded = data.files_processed || [];
      
      const updatedDocs = Array.from(new Set([...uploadedDocs, ...newlyUploaded]));
      setUploadedDocs(updatedDocs);
      localStorage.setItem("rag_uploaded_docs", JSON.stringify(updatedDocs));

      if (data.chunks_created === 0) {
        showError("Warning: Documents were uploaded but no text chunks could be generated. This usually occurs if the files are image-only scans and the Gemini Vision OCR free tier limit was exceeded.");
      } else {
        showSuccess(`Successfully processed ${newlyUploaded.length} document(s) into ${data.chunks_created} chunks.`);
      }
      setFiles([]); // clear files list
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred during upload.";
      showError(msg || "An error occurred during upload. Check backend terminal for detailed logs.");
    } finally {
      setIsUploading(false);
    }
  };

  // Ask Question to backend
  const askQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuestion.trim() || isThinking) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      text: inputQuestion,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuestion("");
    setIsThinking(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: userMessage.text }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to get answer from server.");
      }

      const data = await res.json();

      const assistantMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        text: data.answer,
        timestamp: new Date(),
        citations: data.citations || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Look for rate limit error keywords to show helpful messages
      if (msg && msg.includes("429")) {
        showError("Gemini API Rate Limit Exceeded (429). The free tier allows 15 requests per minute and 20 requests per day. Please try again shortly.");
      } else {
        showError(msg || "An error occurred while fetching response. Check backend logs.");
      }
    } finally {
      setIsThinking(false);
    }
  };

  // Helper to render message content with clickable citation badges
  const renderMessageText = (text: string, citations: Citation[] = []) => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const citationId = match[1];
        const citation = citations.find((c) => c.citation_id === citationId);
        if (citation) {
          return (
            <button
              key={index}
              onClick={() => setSelectedCitation(citation)}
              className="inline-flex items-center justify-center mx-0.5 px-1.5 py-0.5 text-xs font-semibold rounded bg-cyan-500/20 hover:bg-cyan-400/40 text-cyan-400 border border-cyan-500/30 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
              title={`Source: ${citation.source_file}, Page: ${citation.page_number}`}
            >
              {part}
            </button>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#070a13] text-[#e2e8f0] font-sans overflow-hidden">
      {/* Aurora Background Effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Header Section */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#0b0f19]/80 border-b border-[#1e293b]/70 backdrop-blur-xl z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
            <Layers className="w-5.5 h-5.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-1.5">
              DocuMind Research Lab <span className="text-[10px] bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">v1.1</span>
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Multi-Document Cognitive RAG Engine</p>
          </div>
        </div>

        {/* Models and Badges */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300 font-medium">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>ChromaDB local</span>
          </div>

          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-indigo-300 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Model: gemini-flash-latest</span>
          </div>

          {/* API Connection Status */}
          {backendOnline === null ? (
            <span className="flex items-center text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <Loader2 className="w-3 h-3 animate-spin mr-1.5 text-slate-400" /> API Connecting
            </span>
          ) : backendOnline ? (
            <span className="flex items-center text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" /> API Connected
            </span>
          ) : (
            <span className="flex items-center text-xs text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-2" /> API Disconnected
            </span>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Document Library & Ingestion Hub */}
        <aside className="w-80 bg-[#090d16]/90 border-r border-[#1e293b]/50 flex flex-col overflow-hidden z-10">
          {/* File Upload Zone */}
          <div className="p-4 border-b border-[#1e293b]/50">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center">
              <UploadCloud className="w-4 h-4 mr-2 text-cyan-400" /> Document Intake
            </h2>
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group border border-dashed border-[#334155] hover:border-cyan-500/50 hover:bg-[#0b0f19]/60 rounded-xl p-5 text-center cursor-pointer transition-all duration-200"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                multiple
                className="hidden"
              />
              <UploadCloud className="w-7 h-7 mx-auto text-slate-500 group-hover:text-cyan-400 transition-colors duration-200 mb-2" />
              <p className="text-xs font-semibold text-slate-300 group-hover:text-slate-200">
                Drag & drop PDFs here
              </p>
              <p className="text-[10px] text-slate-500 mt-1">or browse computer files</p>
            </div>

            {/* Selected Queue Files */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2 animate-slide-in">
                <p className="text-xs font-bold text-slate-400">Queue for Processing ({files.length}):</p>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {files.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-[#0c1221] rounded-lg border border-[#1e293b] text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span className="truncate text-slate-300 font-medium" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                      <button
                        onClick={() => removeSelectedFile(i)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={uploadFiles}
                  disabled={isUploading}
                  className="w-full mt-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold py-2 px-3 rounded-lg shadow-lg shadow-indigo-500/10 text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing (Image OCR)...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ingest into ChromaDB</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Library of Ingested Documents */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-3 bg-[#080c14] border-b border-[#1e293b]/50 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center">
                <BookOpen className="w-3.5 h-3.5 mr-2 text-indigo-400" /> Active Library
              </h2>
              <span className="text-[10px] font-mono text-cyan-400 font-bold bg-[#0d1527] px-2 py-0.5 rounded-full border border-cyan-500/15">
                {uploadedDocs.length} FILES
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {uploadedDocs.length === 0 ? (
                <div className="text-center py-10 px-4 text-slate-500">
                  <FileSearch className="w-9 h-9 mx-auto opacity-20 mb-2" />
                  <p className="text-xs font-semibold text-slate-400">Library is empty</p>
                  <p className="text-[10px] mt-1 text-slate-500 leading-relaxed">Upload a searchable or scanned PDF to start extracting answers.</p>
                </div>
              ) : (
                uploadedDocs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-3 p-3 rounded-xl bg-[#0c1221] border border-[#1e293b]/80 hover:border-cyan-500/30 transition-all duration-150 group"
                  >
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition-colors">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-xs text-slate-200 font-semibold" title={doc}>
                        {doc}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 uppercase">Processed</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quota & Limits Warning Panel */}
            <div className="p-3.5 m-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] leading-relaxed text-slate-400">
              <div className="flex items-center space-x-1.5 text-amber-400 font-bold mb-1 uppercase tracking-wide">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Gemini Rate Limit Notice</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-1.5">Your key is running on the free-tier quota limits:</p>
              <ul className="list-disc pl-4 space-y-0.5 font-mono text-[9px] text-slate-400">
                <li>15 Requests Per Minute (RPM)</li>
                <li>20 Requests Per Day (RPD)</li>
              </ul>
              <p className="text-[9px] text-amber-500/80 mt-1.5 font-medium">Scanned PDFs trigger visual OCR calls per page. Process short documents to prevent 429 quota exhaustion.</p>
            </div>

            {uploadedDocs.length > 0 && (
              <div className="p-3 border-t border-[#1e293b]/50 bg-[#080c14] text-center">
                <button
                  onClick={() => {
                    localStorage.removeItem("rag_uploaded_docs");
                    setUploadedDocs([]);
                  }}
                  className="text-[9px] font-bold text-slate-500 hover:text-rose-400 uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Reset Library List
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel: Research Chat and Document Inspector Workspace */}
        <main className="flex-1 flex flex-col bg-[#070a13] relative">
          
          {/* Tabs bar */}
          <div className="flex items-center px-6 py-2 bg-[#090d16]/40 border-b border-[#1e293b]/50 gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Research Assistant</span>
            </button>
            <button
              onClick={() => setActiveTab("knowledge")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "knowledge"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Vector Database Inspector</span>
            </button>
          </div>

          {/* Notification Alerts */}
          {errorMsg && (
            <div className="absolute top-12 left-4 right-4 bg-rose-950/45 border border-rose-500/30 text-rose-250 p-4 rounded-xl flex items-start space-x-3 text-xs z-20 animate-fade-in shadow-xl backdrop-blur-md">
              <AlertCircle className="w-4.5 h-4.5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block uppercase tracking-wide mb-0.5">Operation Error</span>
                <span>{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 p-0.5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMsg && (
            <div className="absolute top-12 left-4 right-4 bg-emerald-950/45 border border-emerald-500/30 text-emerald-200 p-4 rounded-xl flex items-start space-x-3 text-xs z-20 animate-fade-in shadow-xl backdrop-blur-md">
              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block uppercase tracking-wide mb-0.5">System Message</span>
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 p-0.5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: Chat Workspace */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Chat Messages Log */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                    <div className="p-4 bg-[#0c1221] rounded-2xl border border-slate-800/80 shadow-inner mb-4 animate-pulse">
                      <Bot className="w-10 h-10 text-cyan-400" />
                    </div>
                    <h3 className="text-lg font-extrabold text-white mb-2 tracking-tight">Active Research Sandbox</h3>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Upload reference documents and type a query. The RAG pipeline will search the database vectors, feed context segments to Gemini, and output answers backed by inline citations.
                    </p>
                    {uploadedDocs.length === 0 && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-[11px] leading-relaxed">
                        To get started, drag and drop reference documents in the sidebar.
                      </div>
                    )}
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex space-x-4 max-w-3xl ${
                        msg.role === "user" ? "ml-auto flex-row-reverse space-x-reverse" : ""
                      }`}
                    >
                      {/* Sender Avatar */}
                      <div
                        className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center shadow-md border ${
                          msg.role === "user"
                            ? "bg-gradient-to-tr from-cyan-500 to-sky-600 border-cyan-400/30 text-white"
                            : "bg-[#0b0f19] border-[#1e293b] text-slate-300"
                        }`}
                      >
                        {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-cyan-400" />}
                      </div>

                      {/* Message Bubble */}
                      <div className="space-y-1.5 max-w-[85%]">
                        <div
                          className={`px-4 py-3.5 rounded-2xl text-xs leading-relaxed border shadow-md ${
                            msg.role === "user"
                              ? "bg-gradient-to-tr from-cyan-600 to-sky-750 border-cyan-500/20 text-white rounded-tr-none"
                              : "bg-[#0b0f19]/80 border-[#1e293b]/70 text-slate-200 rounded-tl-none backdrop-blur-md"
                          }`}
                        >
                          {msg.role === "user" ? (
                            <span>{msg.text}</span>
                          ) : (
                            renderMessageText(msg.text, msg.citations)
                          )}
                        </div>

                        {/* Citations block for assistant response */}
                        {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                          <div className="pl-1 pt-1 flex flex-wrap gap-1.5 items-center">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mr-1">
                              Sources used:
                            </span>
                            {msg.citations.map((citation) => (
                              <button
                                key={citation.citation_id}
                                onClick={() => setSelectedCitation(citation)}
                                className="text-[10px] font-semibold px-2 py-0.5 bg-[#0b0f19]/80 hover:bg-[#131b2c] text-cyan-400 rounded border border-[#1e293b] hover:border-cyan-500/20 transition-all flex items-center space-x-1 shadow-sm cursor-pointer"
                              >
                                <FileText className="w-3 h-3 text-cyan-400" />
                                <span className="truncate max-w-[100px]">{citation.source_file}</span>
                                <span className="text-[9px] text-slate-500">(p. {citation.page_number})</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <span className="block text-[9px] font-mono text-slate-600 pl-1">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {/* Thinking skeleton */}
                {isThinking && (
                  <div className="flex space-x-4 max-w-2xl animate-pulse">
                    <div className="w-9 h-9 rounded-xl bg-[#0b0f19] border border-[#1e293b] flex items-center justify-center">
                      <Bot className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="space-y-2 max-w-[85%]">
                      <div className="px-4 py-3.5 rounded-2xl bg-[#0b0f19]/40 border border-[#1e293b]/40 text-slate-400 rounded-tl-none text-xs flex items-center space-x-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>Searching database vectors & running inference...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* User Input Bar */}
              <div className="p-4 bg-[#0b0f19]/60 border-t border-[#1e293b]/50">
                <form onSubmit={askQuestion} className="flex items-center space-x-2 max-w-4xl mx-auto">
                  <input
                    type="text"
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    disabled={isThinking || !backendOnline || uploadedDocs.length === 0}
                    placeholder={
                      !backendOnline
                        ? "API connection offline. Run startup scripts."
                        : uploadedDocs.length === 0
                        ? "Ingest documents in the sidebar to begin..."
                        : "Query your library (e.g., 'Compare the findings of the documents')"
                    }
                    className="flex-1 bg-[#090d16] hover:bg-[#0c1221] focus:bg-[#0c1221] text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3.5 border border-[#1e293b]/80 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/40 focus:outline-none text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!inputQuestion.trim() || isThinking || !backendOnline || uploadedDocs.length === 0}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white p-3.5 rounded-xl shadow-lg flex items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed disabled:bg-[#0b0f19]/80 disabled:text-slate-650 transition-all cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: Database Inspector */}
          {activeTab === "knowledge" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="max-w-4xl mx-auto space-y-4">
                <div className="p-5 rounded-2xl bg-[#0b0f19]/80 border border-[#1e293b] shadow-lg">
                  <h3 className="text-sm font-bold text-white mb-2 flex items-center">
                    <Database className="w-4 h-4 text-cyan-400 mr-2" /> Vector Index Overview
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    Below is the visual structure of your RAG Database. Chunks are extracted, vectorized into 768-dimension arrays using `gemini-embedding-001`, and indexed in local ChromaDB collections.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-[#070a13] p-4 rounded-xl border border-slate-800">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Database Store</span>
                      <span className="text-sm font-bold text-slate-200 mt-1 block">ChromaDB Persistent</span>
                    </div>
                    <div className="bg-[#070a13] p-4 rounded-xl border border-slate-800">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Active Collection</span>
                      <span className="text-sm font-bold text-slate-200 mt-1 block font-mono">research_documents</span>
                    </div>
                    <div className="bg-[#070a13] p-4 rounded-xl border border-slate-800">
                      <span className="block text-[10px] text-slate-500 uppercase font-semibold">Chunk Parameters</span>
                      <span className="text-xs font-bold text-slate-300 mt-1 block font-mono">1200 char size / 200 overlap</span>
                    </div>
                  </div>
                </div>

                {/* Database files stats table */}
                <div className="rounded-2xl bg-[#0b0f19]/80 border border-[#1e293b] overflow-hidden shadow-lg">
                  <div className="px-5 py-4 border-b border-[#1e293b] flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Document Segment Index</span>
                    <span className="text-[10px] bg-cyan-500/10 text-cyan-400 font-semibold px-2.5 py-0.5 rounded-full border border-cyan-500/20">
                      Ready
                    </span>
                  </div>

                  {uploadedDocs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <Layers className="w-8 h-8 mx-auto opacity-20 mb-2" />
                      <span>Ingest documents to index chunks in the database.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#1e293b]">
                      {uploadedDocs.map((doc, idx) => (
                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-900/20 transition-all">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="block text-xs font-bold text-slate-200 truncate max-w-md">{doc}</span>
                              <span className="block text-[10px] text-slate-500 mt-0.5">Type: PDF Document</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <span className="text-[10px] bg-slate-900 px-3 py-1 rounded-full border border-slate-800 text-slate-400 font-mono">
                              ChromaDB indexed
                            </span>
                            <a
                              href={`${API_BASE}/files/${doc}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-cyan-400 p-1 transition-colors"
                              title="Open original file"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel: Page-Jump PDF Viewer & Metadata detail panel */}
        {selectedCitation && (
          <aside className="w-[520px] bg-[#090d16] border-l border-[#1e293b]/50 flex flex-col animate-slide-in shadow-2xl z-10">
            <div className="p-4 border-b border-[#1e293b]/50 flex items-center justify-between bg-[#0b0f19]/80">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-350 flex items-center">
                <FileSearch className="w-4 h-4 mr-2 text-cyan-400" /> Citation Analyzer
              </h3>
              <button
                onClick={() => setSelectedCitation(null)}
                className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-950 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Document Info */}
              <div className="flex items-start justify-between gap-4 bg-[#0c1221] p-3.5 rounded-xl border border-[#1e293b] shadow-inner">
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">
                    Source File
                  </span>
                  <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400 truncate">
                    <FileText className="w-4 h-4 flex-shrink-0 text-cyan-400" />
                    <span className="truncate" title={selectedCitation.source_file}>
                      {selectedCitation.source_file}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">
                    Context Anchor
                  </span>
                  <span className="inline-block text-[11px] font-bold text-slate-200 bg-[#161f36] px-2.5 py-1 rounded-lg border border-slate-800 font-mono">
                    Page {selectedCitation.page_number}
                  </span>
                </div>
              </div>

              {/* Embedded PDF Viewer jumping to correct page */}
              <div>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">
                  Embedded PDF Page View (Auto Scroll)
                </span>
                <div className="relative w-full h-[320px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 shadow-2xl">
                  <iframe
                    key={`${selectedCitation.source_file}-${selectedCitation.page_number}`}
                    src={`${API_BASE}/files/${selectedCitation.source_file}#page=${selectedCitation.page_number}`}
                    className="w-full h-full border-none"
                    title="PDF Page Preview"
                  />
                </div>
                <div className="mt-1.5 flex items-center space-x-1.5 text-[9px] text-slate-500 leading-normal pl-1">
                  <Info className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                  <span>Jumps to page {selectedCitation.page_number} automatically. If it fails, check if the browser supports PDF inline viewing.</span>
                </div>
              </div>

              {/* Raw Database Chunk Text */}
              <div className="flex flex-col flex-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block mb-1">
                  Database Context Segment
                </span>
                <div className="bg-[#070a13] border border-slate-800 text-xs text-slate-300 p-4 rounded-xl leading-relaxed max-h-52 overflow-y-auto font-mono whitespace-pre-wrap border-l-2 border-l-cyan-500/80 shadow-md">
                  {selectedCitation.chunk_text}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#1e293b]/50 bg-[#0b0f19]/30 text-center">
              <p className="text-[9px] text-slate-500 font-semibold tracking-wide">
                RETRIEVED VIA VECTOR COSINE SIMILARITY SEARCH
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
