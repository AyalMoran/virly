import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatRelativeDate } from "../../lib/format";
import type { ActivityEventDto } from "../../lib/types";

// CircleMarker (SVG) instead of Marker: leaflet's default icon PNGs do not
// survive bundlers without asset shims, and a dot is the right visual anyway.
export default function ActivityMap({ events }: { events: ActivityEventDto[] }) {
  const points = events
    .filter((e): e is ActivityEventDto & { lat: number; lng: number } => e.lat !== null && e.lng !== null)
    .slice(0, 50);
  if (points.length === 0) return null;
  const center: [number, number] = [points[0]!.lat, points[0]!.lng];
  const path = points.map((p) => [p.lat, p.lng] as [number, number]);
  return (
    <MapContainer center={center} zoom={4} scrollWheelZoom={false} style={{ height: 280, width: "100%", borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {path.length > 1 ? <Polyline positions={path} pathOptions={{ weight: 2, opacity: 0.5 }} /> : null}
      {points.map((event) => (
        <CircleMarker center={[event.lat, event.lng]} key={event.id} radius={7}>
          <Popup>
            {event.kind === "login" ? "Login" : "Transfer"} - {[event.city, event.country].filter(Boolean).join(", ")}
            <br />
            {formatRelativeDate(event.at)}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
