from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from typing import Optional, Dict, Any
import uvicorn
from dotenv import load_dotenv
import os

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