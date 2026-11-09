# BMTC Real-Time Transit & Fleet Tracking System

A full-stack, high-density transit routing and live fleet tracking platform for BMTC (Route 273C). Built with a "no-frills," terminal-style ledger interface prioritizing performance, real-time data density, and minimal rendering overhead over heavy map visualizers.

---

## 🛠 Tech Stack

* **Backend:** FastAPI (Python 3.12), Supabase (PostgreSQL), `asyncpg`
* **Frontend:** Next.js (React / TypeScript), Tailwind CSS
* **Communication:** WebSockets (FastAPI `ConnectionManager` with custom JSON telemetry protocol)

---

## 🚀 Key Features

* **Route Discovery (`/api/v1/routes/search`):** Search direct single-bus routes or multi-leg stop sequences across custom PostgreSQL route schemas.
* **Live Fleet Telemetry Stream:** WebSocket endpoint (`/ws/routes/{route_id}`) broadcasting dynamic multi-vehicle telemetry to active clients every 3 seconds.
* **High-Density Ledger UI:** High-contrast, map-free terminal interface rendering live coordinates, approaching stops, dynamic ETAs, and real-time seat availability.
* **Async Connection Management:** Lifespan-managed WebSocket connection pooling handling concurrent updates without blocking the main event loop.

---

## 💻 Local Development Setup

### 1. Backend Setup (FastAPI)

```bash
# Navigate to server directory
cd server

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn asyncpg supabase

# Start the development server
uvicorn main:app --reload --port 8000

```

### 2. Frontend Setup (Next.js)

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start the Next.js development server
npm run dev

```

Open [http://localhost:3000](http://localhost:3000) in your browser to test the route search and live telemetry stream.

---

## 📡 WebSocket API Specification

**Endpoint:** `ws://localhost:8000/ws/routes/{route_id}`

**Sample Telemetry Broadcast Payload:**

```json
{
  "event": "FLEET_LOCATION_UPDATE",
  "route_id": "273C",
  "buses": [
    {
      "bus_id": "KA-01-F-273C-01",
      "latitude": 12.9767,
      "longitude": 77.5713,
      "next_stop": "Majestic",
      "eta_mins": 12,
      "available_seats": 30
    },
    {
      "bus_id": "KA-01-F-273C-02",
      "latitude": 13.0012,
      "longitude": 77.5641,
      "next_stop": "Malleshwaram 18th Cross",
      "eta_mins": 8,
      "available_seats": 15
    }
  ]
}

```
