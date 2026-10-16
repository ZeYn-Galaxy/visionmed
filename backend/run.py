import uvicorn
import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Starting VisionMed Python Backend on port {port}...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
