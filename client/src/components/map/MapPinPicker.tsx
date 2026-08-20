'use client';

// Click-to-drop-pin location picker — pickup_location_picker,
// drop_location_picker. Plain client component; every page rendering it
// MUST dynamic-import with { ssr: false }, same reason as RouteMap.
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export interface LatLng {
  lat: number;
  lng: number;
}

interface MapPinPickerProps {
  value: LatLng;
  onChange: (point: LatLng) => void;
  className?: string;
}

function pinIcon() {
  return L.divIcon({
    className: '',
    html: `<svg width="30" height="38" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(15,14,12,.35))">
      <path d="M12 29S2 17.8 2 11a10 10 0 1 1 20 0c0 6.8-10 18-10 18Z" fill="#A83900"/>
      <circle cx="12" cy="11" r="4.2" fill="white"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
  });
}
const icon = pinIcon();

function ClickHandler({ onChange }: { onChange: (point: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapPinPicker({ value, onChange, className = '' }: MapPinPickerProps) {
  return (
    <div className={`overflow-hidden rounded-ip-card ${className}`}>
      <MapContainer center={[value.lat, value.lng]} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[value.lat, value.lng]} icon={icon} draggable eventHandlers={{ dragend: (e) => {
          const m = e.target as L.Marker;
          const pos = m.getLatLng();
          onChange({ lat: pos.lat, lng: pos.lng });
        } }} />
        <ClickHandler onChange={onChange} />
      </MapContainer>
    </div>
  );
}
