from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from typing import Optional, Dict, Any, List
import uvicorn
from dotenv import load_dotenv
import os
import asyncio


load_dotenv()

# Replace these with your exact Supabase URL and Legacy API Key from your screenshot
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="BMTC Transit Route Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# websocket parts
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        
    async def connect(self, websocket: WebSocket, route_id: str):
        await websocket.accept()
        if route_id not in self.active_connections:
            self.active_connections[route_id] = []
        self.active_connections[route_id].append(websocket)  
        
    async def disconnect(self, websocket: WebSocket, route_id: str):
        if route_id in self.active_connections:
            # you cant use del here because, well imagine an adjacency list
            # you cant delete the nodes just because you wanna delete one neighbour
            self.active_connections[route_id].remove(websocket)
            if not self.active_connections[route_id]: #i.e if there are no websockets attached to this route_id (no neighbours for this node)
                del self.active_connections[route_id]

    async def broadcast_to_route(self, route_id: str, message: dict):
        if route_id in self.active_connections:
            for connection in self.active_connections[route_id]:
                await connection.send_json(message)
                
manager = ConnectionManager();

@app.websocket("/ws/routes/{route_id}")
async def route_telemetry(websocket: WebSocket, route_id: str):
    # gives route telemetry of all the busses in that route
    await manager.connect(websocket, route_id)
    mock_waypoints = [
        {"lat": 12.9767, "lng": 77.5713, "stop": "Majestic"},
        {"lat": 12.9918, "lng": 77.5712, "stop": "Sampige Road"},
        {"lat": 13.0012, "lng": 77.5641, "stop": "Malleshwaram 18th Cross"},
        {"lat": 13.0183, "lng": 77.5548, "stop": "Yeshwanthpur TTMC"},
    ]
    
    # Track multiple active buses on this route with staggered starting waypoint indexes
    active_buses = [
        {"bus_id": f"KA-01-F-{route_id[:4].upper()}-01", "step": 0},
        {"bus_id": f"KA-01-F-{route_id[:4].upper()}-02", "step": 2},
    ]
    
    try:
        while True:
            fleet_telemetry = []
            
            # simulate busses
            for bus in active_buses:
                current_pos = mock_waypoints[bus["step"] % len(mock_waypoints)]
                fleet_telemetry.append({
                    "bus_id": bus["bus_id"],
                    "latitude": current_pos["lat"],
                    "longitude": current_pos["lng"],
                    "next_stop": current_pos["stop"],
                    "eta_mins": max(1, 12 - (bus["step"] * 2) % 12),
                    "available_seats": max(0, 30 - (bus["step"] * 5) % 30)
                })
                # Advance bus position
                bus["step"] += 1
                
            await websocket.send_json(
                {
                    "event": "FLEET_LOCATION_UPDATE",
                    "route_id": route_id,
                    "buses": fleet_telemetry
                }
            )
            
            await asyncio.sleep(5)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, route_id)
        print(f'Disconnected {route_id} from websocket: {websocket}')
    

@app.get("/api/v1/routes/search")
async def search_routes(
    start: str = Query(..., description="Start stop name"),
    destination: str = Query(..., description="Destination stop name"),
    waypoint: Optional[str] = Query(None, description="Optional intermediate stop")
) -> Dict[str, Any]:

    # 1. Fetch Start and Destination Stop IDs
    start_resp = supabase.table("bus_stops").select("id, name").ilike("name", f"%{start}%").execute()
    dest_resp = supabase.table("bus_stops").select("id, name").ilike("name", f"%{destination}%").execute()

    if not start_resp.data or not dest_resp.data:
        raise HTTPException(status_code=404, detail="Start or Destination stop not found")

    start_stop = start_resp.data[0]
    dest_stop = dest_resp.data[0]

    start_id, start_name = start_stop["id"], start_stop["name"]
    dest_id, dest_name = dest_stop["id"], dest_stop["name"]

    waypoint_id, waypoint_name = None, None
    if waypoint and waypoint.strip():
        wp_resp = supabase.table("bus_stops").select("id, name").ilike("name", f"%{waypoint}%").execute()
        if wp_resp.data:
            waypoint_id = wp_resp.data[0]["id"]
            waypoint_name = wp_resp.data[0]["name"]

    one_bus_routes = []
    multiple_leg_routes = []

    # -----------------------------------------------------------------
    # MODE 1: DIRECT ROUTES (Fetch via route_stops sequence comparison)
    # -----------------------------------------------------------------
    if not waypoint_id:
        # Fetch matching routes where start stop sequence < destination stop sequence
        rs_start = supabase.table("route_stops").select("route_id, sequence").eq("stop_id", start_id).execute()
        
        if rs_start.data:
            for s_item in rs_start.data:
                r_id = s_item["route_id"]
                start_seq = s_item["sequence"]

                rs_dest = supabase.table("route_stops").select("sequence").eq("route_id", r_id).eq("stop_id", dest_id).gt("sequence", start_seq).execute()
                
                if rs_dest.data:
                    route_info = supabase.table("bmtc_routes").select("route_no, route_type").eq("id", r_id).single().execute()
                    if route_info.data:
                        one_bus_routes.append({
                            "id": f"direct-{r_id}",
                            "route_no": route_info.data["route_no"],
                            "route_type": route_info.data["route_type"],
                            "current_stop_summary": "at stop A-2 now",
                            "eta_mins": 5,
                            "is_at_start": False,
                            "legs": [
                                {"from": start_name, "to": dest_name, "route_no": route_info.data["route_no"]}
                            ]
                        })

    # -----------------------------------------------------------------
    # MODE 2: MULTI-LEG ROUTES (Transfer / Waypointed options)
    # -----------------------------------------------------------------
    # Sample multi-leg mock response structure for search preview
    multiple_leg_routes.append({
        "id": "multi-1",
        "transfer_stop": waypoint_name if waypoint_name else "Yeshwanthpur TTMC",
        "legs": [
            {
                "from": start_name,
                "to": waypoint_name if waypoint_name else "Yeshwanthpur TTMC",
                "route_no": "252C",
                "current_stop_summary": "at stop A-2 now",
                "eta_mins": 5,
                "is_at_start": False
            },
            {
                "from": waypoint_name if waypoint_name else "Yeshwanthpur TTMC",
                "to": dest_name,
                "route_no": "185",
                "current_stop_summary": "at stop B-1 now",
                "eta_mins": 12,
                "is_at_start": False
            }
        ]
    })

    return {
        "search_params": {"start": start_name, "waypoint": waypoint_name, "destination": dest_name},
        "one_bus_routes": one_bus_routes,
        "multiple_leg_routes": multiple_leg_routes
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)