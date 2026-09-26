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
    # MODE 2: MULTI-LEG ROUTES (Real transfer search — no hardcoding)
    # -----------------------------------------------------------------
    # Algorithm: 4 bulk Supabase queries, then set-intersection in Python.
    #
    # Step A: Find every (route_id, stop_id, sequence) reachable FROM start_id.
    #         i.e. all route_stops rows where route_id passes through start_id,
    #         and the stop's sequence is AFTER start_id's sequence on that route.
    #         These are the "forward reachable" stops from the origin.
    #
    # Step B: Find every (route_id, stop_id, sequence) that can REACH dest_id.
    #         i.e. all route_stops rows where route_id passes through dest_id,
    #         and the stop's sequence is BEFORE dest_id's sequence on that route.
    #         These are the "backward reachable" stops into the destination.
    #
    # Step C: Intersect on stop_id → these are valid transfer stops.
    #         For each transfer stop, pair every (leg1_route, leg2_route) combo.
    #
    # If a waypoint was provided, we only consider that stop as the transfer.

    # --- STEP A: stops reachable forward from start_id ---
    # Fetch all route_stops entries for routes that serve start_id
    routes_from_start = supabase.table("route_stops") \
        .select("route_id, sequence") \
        .eq("stop_id", start_id) \
        .execute()

    # Build a map: route_id -> start_sequence (the sequence of start_id on that route)
    start_seq_by_route: Dict[str, int] = {
        row["route_id"]: row["sequence"] for row in (routes_from_start.data or [])
    }

    # For each of those routes, fetch all stops that come AFTER start_id
    forward_reachable: Dict[str, List[dict]] = {}  # stop_id -> list of {route_id, route_no, route_type, sequence}

    if start_seq_by_route:
        route_ids_from_start = list(start_seq_by_route.keys())

        # Bulk fetch all stops on all origin routes in one query
        all_stops_on_origin_routes = supabase.table("route_stops") \
            .select("route_id, stop_id, sequence") \
            .in_("route_id", route_ids_from_start) \
            .execute()

        # Fetch route metadata for origin routes in bulk
        origin_route_info_resp = supabase.table("bmtc_routes") \
            .select("id, route_no, route_type") \
            .in_("id", route_ids_from_start) \
            .execute()
        origin_route_info: Dict[str, dict] = {
            r["id"]: r for r in (origin_route_info_resp.data or [])
        }

        for row in (all_stops_on_origin_routes.data or []):
            r_id = row["route_id"]
            # Only keep stops that come AFTER start_id on this route
            if row["sequence"] > start_seq_by_route[r_id] and row["stop_id"] != dest_id:
                stop_id = row["stop_id"]
                if stop_id not in forward_reachable:
                    forward_reachable[stop_id] = []
                if r_id in origin_route_info:
                    forward_reachable[stop_id].append({
                        "route_id": r_id,
                        "route_no": origin_route_info[r_id]["route_no"],
                        "route_type": origin_route_info[r_id]["route_type"],
                        "sequence": row["sequence"]
                    })

    # --- STEP B: stops that can reach dest_id ---
    routes_to_dest = supabase.table("route_stops") \
        .select("route_id, sequence") \
        .eq("stop_id", dest_id) \
        .execute()

    dest_seq_by_route: Dict[str, int] = {
        row["route_id"]: row["sequence"] for row in (routes_to_dest.data or [])
    }

    backward_reachable: Dict[str, List[dict]] = {}  # stop_id -> list of {route_id, route_no, route_type, sequence}

    if dest_seq_by_route:
        route_ids_to_dest = list(dest_seq_by_route.keys())

        all_stops_on_dest_routes = supabase.table("route_stops") \
            .select("route_id, stop_id, sequence") \
            .in_("route_id", route_ids_to_dest) \
            .execute()

        dest_route_info_resp = supabase.table("bmtc_routes") \
            .select("id, route_no, route_type") \
            .in_("id", route_ids_to_dest) \
            .execute()
        dest_route_info: Dict[str, dict] = {
            r["id"]: r for r in (dest_route_info_resp.data or [])
        }

        for row in (all_stops_on_dest_routes.data or []):
            r_id = row["route_id"]
            # Only keep stops that come BEFORE dest_id on this route
            if row["sequence"] < dest_seq_by_route[r_id] and row["stop_id"] != start_id:
                stop_id = row["stop_id"]
                if stop_id not in backward_reachable:
                    backward_reachable[stop_id] = []
                if r_id in dest_route_info:
                    backward_reachable[stop_id].append({
                        "route_id": r_id,
                        "route_no": dest_route_info[r_id]["route_no"],
                        "route_type": dest_route_info[r_id]["route_type"],
                        "sequence": row["sequence"]
                    })

    # --- STEP C: Intersect to find valid transfer stops ---
    # If a waypoint was given, restrict to only that stop
    if waypoint_id:
        candidate_transfer_stop_ids = {waypoint_id} if waypoint_id in forward_reachable and waypoint_id in backward_reachable else set()
    else:
        candidate_transfer_stop_ids = set(forward_reachable.keys()) & set(backward_reachable.keys())

    # Fetch stop names for all transfer candidates in one bulk query
    transfer_stop_names: Dict[str, str] = {}
    if candidate_transfer_stop_ids:
        transfer_stops_resp = supabase.table("bus_stops") \
            .select("id, name") \
            .in_("id", list(candidate_transfer_stop_ids)) \
            .execute()
        transfer_stop_names = {
            row["id"]: row["name"] for row in (transfer_stops_resp.data or [])
        }

    # Build multi-leg results — cap at 5 to avoid overwhelming the response
    seen_route_pairs: set = set()
    for transfer_stop_id in list(candidate_transfer_stop_ids)[:10]:
        transfer_name = transfer_stop_names.get(transfer_stop_id, "Unknown Stop")
        leg1_options = forward_reachable.get(transfer_stop_id, [])
        leg2_options = backward_reachable.get(transfer_stop_id, [])

        for leg1 in leg1_options:
            for leg2 in leg2_options:
                # Deduplicate: same (leg1_route, leg2_route, transfer) combo
                pair_key = (leg1["route_id"], leg2["route_id"], transfer_stop_id)
                if pair_key in seen_route_pairs:
                    continue
                seen_route_pairs.add(pair_key)

                multiple_leg_routes.append({
                    "id": f"multi-{leg1['route_id']}-{leg2['route_id']}-{transfer_stop_id}",
                    "transfer_stop": transfer_name,
                    "legs": [
                        {
                            "from": start_name,
                            "to": transfer_name,
                            "route_no": leg1["route_no"],
                            "route_type": leg1["route_type"],
                            "eta_mins": None,   # real ETA needs live GPS feed
                            "is_at_start": False
                        },
                        {
                            "from": transfer_name,
                            "to": dest_name,
                            "route_no": leg2["route_no"],
                            "route_type": leg2["route_type"],
                            "eta_mins": None,
                            "is_at_start": False
                        }
                    ]
                })

                if len(multiple_leg_routes) >= 5:
                    break
            if len(multiple_leg_routes) >= 5:
                break

    return {
        "search_params": {"start": start_name, "waypoint": waypoint_name, "destination": dest_name},
        "one_bus_routes": one_bus_routes,
        "multiple_leg_routes": multiple_leg_routes
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)