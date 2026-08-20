'use client';

// Demand/supply heatmap — performance_analytics_heatmaps,
// regional_surge_zone_management. Renders each cluster as a
// radius-by-intensity circle (no external heatmap plugin dependency);
// dynamic-import with { ssr: false } like every other map component here.
import { MapContainer, TileLayer, Circle, Tooltip } from 'react-leaflet';

export interface HeatPoint {
  lat: number;
  lng: number;
  /** 0-1 relative intensity — drives circle radius and opacity. */
  intensity: number;
  label?: string;
}

interface HeatmapMapProps {
  points: HeatPoint[];
  center: { lat: number; lng: number };
  zoom?: number;
  className?: string;
}

export default function HeatmapMap({ points, center, zoom = 11, className = '' }: HeatmapMapProps) {
  return (
    <div className={`overflow-hidden rounded-ip-card ${className}`}>
      <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p, i) => (
          <Circle
            key={i}
            center={[p.lat, p.lng]}
            radius={400 + p.intensity * 1800}
            pathOptions={{ color: '#A83900', fillColor: '#FF6B2B', fillOpacity: 0.15 + p.intensity * 0.35, weight: 1 }}
          >
            {p.label && <Tooltip>{p.label}</Tooltip>}
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}
