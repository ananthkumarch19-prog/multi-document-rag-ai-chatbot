from pydantic import BaseModel
from typing import List


class Citation(BaseModel):
    citation_id: str
    source_file: str
    page_number: int
    chunk_text: str


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    citations: List[Citation]


class UploadResponse(BaseModel):
    message: str
    files_processed: List[str]
    chunks_created: int