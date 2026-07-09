import os
from typing import Annotated

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.pdf_ingest import process_uploaded_pdfs
from app.rag_engine import rag_engine
from app.schemas import AskRequest, AskResponse, UploadResponse


app = FastAPI(
    title="Multi-Document Research Assistant",
    description="Upload multiple PDFs and ask cited research questions.",
    version="1.0.0",
)


# Resolve upload directory absolute path
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploaded_files")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount static files to serve PDFs
app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "message": "Research Assistant API is running.",
    }


@app.post("/upload", response_model=UploadResponse)
async def upload_pdfs(
    files: Annotated[
        list[UploadFile],
        File(description="Upload one or more PDF files"),
    ],
):
    documents = await process_uploaded_pdfs(files)
    chunks_created = rag_engine.add_documents(documents)

    files_processed = sorted({doc.metadata["source_file"] for doc in documents})

    return UploadResponse(
        message="PDF files processed successfully.",
        files_processed=files_processed,
        chunks_created=chunks_created,
    )


@app.post("/ask", response_model=AskResponse)
def ask_question(request: AskRequest):
    return rag_engine.ask(request.question)