import os
from io import BytesIO
from typing import List

import fitz  # PyMuPDF
from dotenv import load_dotenv
from fastapi import UploadFile, HTTPException
from google import genai
from google.genai import types
from llama_index.core import Document
from PyPDF2 import PdfReader

load_dotenv()

CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200

# Resolve upload directory absolute path
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploaded_files")
os.makedirs(UPLOAD_DIR, exist_ok=True)

genai_client = None

def get_genai_client():
    global genai_client
    if genai_client is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if api_key:
            genai_client = genai.Client(api_key=api_key)
        else:
            genai_client = genai.Client()
    return genai_client

def run_gemini_ocr(image_bytes: bytes) -> str:
    try:
        client = get_genai_client()
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type='image/png',
                ),
                "Transcribe all text on this page exactly. Maintain paragraphs. Do not add any conversational commentary, just return the transcribed text. If there is no text in the image, return nothing."
            ]
        )
        return response.text or ""
    except Exception as e:
        print(f"Error during Gemini OCR: {e}")
        return ""

def clean_text(text: str) -> str:
    return " ".join(text.split())

def chunk_text(text: str) -> List[str]:
    chunks = []
    start = 0

    while start < len(text):
        end = start + CHUNK_SIZE
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start = end - CHUNK_OVERLAP

    return chunks

async def process_uploaded_pdfs(files: List[UploadFile]) -> List[Document]:
    documents = []

    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename} is not a PDF file.",
            )

        file_bytes = await file.read()

        # Save PDF file to static directory
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        pdf_reader = PdfReader(BytesIO(file_bytes))
        pymupdf_doc = None

        try:
            for page_index, page in enumerate(pdf_reader.pages):
                raw_text = page.extract_text() or ""
                page_text = clean_text(raw_text)

                # If the text is empty or too short, it is likely a scanned/image page. Fallback to OCR.
                if len(page_text.strip()) < 10:
                    try:
                        if pymupdf_doc is None:
                            pymupdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                        
                        fitz_page = pymupdf_doc.load_page(page_index)
                        pix = fitz_page.get_pixmap(dpi=150)  # Render page image at 150 DPI
                        png_bytes = pix.tobytes("png")
                        
                        ocr_text = run_gemini_ocr(png_bytes)
                        page_text = clean_text(ocr_text)
                    except Exception as ocr_err:
                        print(f"OCR failed for {file.filename} page {page_index + 1}: {ocr_err}")

                if not page_text:
                    continue

                page_number = page_index + 1
                chunks = chunk_text(page_text)

                for chunk_index, chunk in enumerate(chunks):
                    chunk_id = f"{file.filename}-page-{page_number}-chunk-{chunk_index + 1}"

                    document = Document(
                        text=chunk,
                        metadata={
                            "chunk_id": chunk_id,
                            "source_file": file.filename,
                            "page_number": page_number,
                            "chunk_index": chunk_index + 1,
                        },
                    )

                    documents.append(document)
        finally:
            if pymupdf_doc:
                pymupdf_doc.close()

    return documents