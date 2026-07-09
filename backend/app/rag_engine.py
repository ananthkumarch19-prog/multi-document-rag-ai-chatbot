import os
from typing import List

import chromadb
from dotenv import load_dotenv
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.core.schema import NodeWithScore
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.llms.google_genai import GoogleGenAI
from llama_index.vector_stores.chroma import ChromaVectorStore

from app.schemas import AskResponse, Citation


load_dotenv()

CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR", "./chroma_db")
COLLECTION_NAME = "research_documents"

LLM_MODEL = os.getenv("LLM_MODEL", "gemini-flash-latest")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")


class RAGEngine:
    def __init__(self):
        Settings.embed_model = GoogleGenAIEmbedding(model_name=EMBEDDING_MODEL)
        Settings.llm = GoogleGenAI(model=LLM_MODEL)

        self.chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
        self.chroma_collection = self.chroma_client.get_or_create_collection(
            COLLECTION_NAME
        )

        self.vector_store = ChromaVectorStore(
            chroma_collection=self.chroma_collection
        )

        self.storage_context = StorageContext.from_defaults(
            vector_store=self.vector_store
        )

    def add_documents(self, documents: List) -> int:
        if not documents:
            return 0

        VectorStoreIndex.from_documents(
            documents,
            storage_context=self.storage_context,
        )

        return len(documents)

    def get_index(self) -> VectorStoreIndex:
        return VectorStoreIndex.from_vector_store(
            self.vector_store,
            storage_context=self.storage_context,
        )

    def retrieve_chunks(self, question: str, top_k: int = 5) -> List[NodeWithScore]:
        index = self.get_index()
        retriever = index.as_retriever(similarity_top_k=top_k)

        return retriever.retrieve(question)

    def ask(self, question: str) -> AskResponse:
        retrieved_nodes = self.retrieve_chunks(question)

        if not retrieved_nodes:
            return AskResponse(
                answer="I could not find relevant information in the uploaded documents.",
                citations=[],
            )

        citation_blocks = []
        citations = []

        for index, node_with_score in enumerate(retrieved_nodes, start=1):
            node = node_with_score.node
            metadata = node.metadata

            citation_id = str(index)
            source_file = metadata.get("source_file", "Unknown file")
            page_number = int(metadata.get("page_number", 0))
            chunk_text = node.get_content()

            citation_blocks.append(
                f"[{citation_id}] Source: {source_file}, Page: {page_number}\n"
                f"{chunk_text}"
            )

            citations.append(
                Citation(
                    citation_id=citation_id,
                    source_file=source_file,
                    page_number=page_number,
                    chunk_text=chunk_text,
                )
            )

        context_text = "\n\n".join(citation_blocks)

        prompt = f"""
You are a careful research assistant.

Answer the user's question using only the provided source chunks.

Rules:
1. Every factual claim must end with an inline citation like [1] or [2].
2. If the answer is not supported by the source chunks, say you do not know.
3. Do not invent citations.
4. Keep the answer clear and useful.

Source chunks:
{context_text}

User question:
{question}
"""

        response = Settings.llm.complete(prompt)

        return AskResponse(
            answer=str(response),
            citations=citations,
        )


rag_engine = RAGEngine()