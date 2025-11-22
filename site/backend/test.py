from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

app = FastAPI()

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NumberInput(BaseModel):
    number: int

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

@app.post("/cube")
def cube_number(input_data: NumberInput):
    """
    Receives a number and returns its cube
    """
    result = input_data.number ** 3
    return {"number": input_data.number, "cube": result}

# Mount static files - serve the frontend directory
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")