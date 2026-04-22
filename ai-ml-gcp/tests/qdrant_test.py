from qdrant_client import QdrantClient
from dotenv import load_dotenv
load_dotenv()
import os

client = QdrantClient(
    host = os.getenv("QDRANT_HOST", "localhost"),
    port=6333,
    api_key=os.getenv("QDRANT_API_KEY"),
    https=True,
)
print("Printing : ",client.get_collections())