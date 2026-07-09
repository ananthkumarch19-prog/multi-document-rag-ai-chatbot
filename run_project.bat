@echo off
title RAG Chatbot Runner

echo ==========================================
echo Starting Multi-Document RAG AI Chatbot
echo ==========================================

echo [1/2] Launching Python Backend on Port 8001...
start "RAG Backend Server" cmd /k "cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8001"

echo [2/2] Launching Next.js Frontend on Port 3000...
start "RAG Frontend Server" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================
echo Both servers are starting up in separate windows!
echo - Frontend: http://localhost:3000
echo - Backend API: http://localhost:8001
echo ==========================================
echo Keep the launched terminal windows open. 
echo Press any key in this window to close this launcher...
pause > nul
