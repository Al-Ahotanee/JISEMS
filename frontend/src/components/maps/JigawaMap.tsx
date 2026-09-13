import { useState } from 'react';
import { MapContainer, TileLayer, Popup, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Anomaly } from '../../types';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface JigawaMapProps {
  anomalies: Anomaly[];
  onSelectAnomaly?: (anomaly: Anomaly) => void;
}

// Center of Jigawa State (Dutse)
const JIGAWA_CENTER: [number, number] = [11.7562, 9.3390];
const ZOOM_LEVEL = 8.5;

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function JigawaMap({ anomalies, onSelectAnomaly }: JigawaMapProps) {
  const [activeCenter, setActiveCenter] = useState<[number, number]>(JIGAWA_CENTER);
  const [activeZoom, setActiveZoom] = useState(ZOOM_LEVEL);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'warning': return '#a855f7';
      default: return '#1d4ed8';
    }
  };

  return (
    <div className="h-full w-full relative rounded-xl overflow-hidden shadow-lg border border-dark-border">
      <MapContainer 
        center={JIGAWA_CENTER} 
        zoom={ZOOM_LEVEL} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', background: '#0f172a' }}
      >
        <ChangeView center={activeCenter} zoom={activeZoom} />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {anomalies.map((anomaly, idx) => {
          const id = anomaly.id || idx;
          const latJitter = (id % 10) * 0.08 - 0.4;
          const lngJitter = (id % 7) * 0.08 - 0.28;
          const lat = JIGAWA_CENTER[0] + latJitter;
          const lng = JIGAWA_CENTER[1] + lngJitter;

          return (
            <CircleMarker
              key={anomaly.id || idx}
              center={[lat, lng]}
              radius={8}
              pathOptions={{ 
                fillColor: getSeverityColor(anomaly.severity), 
                color: '#0f172a', 
                weight: 2, 
                fillOpacity: 0.85 
              }}
              eventHandlers={{
                click: () => {
                  setActiveCenter([lat, lng]);
                  setActiveZoom(11);
                  if (onSelectAnomaly) onSelectAnomaly(anomaly);
                },
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1">
                  <h3 className="font-bold text-sm text-gray-800 mb-1">{anomaly.type?.replace(/_/g, ' ').toUpperCase()}</h3>
                  <p className="text-xs text-gray-600 mb-2">{anomaly.detail}</p>
                  <div className="text-xs font-semibold text-gray-700">
                    <p>LGA: {anomaly.lga_name || 'Unknown'}</p>
                    <p>Ward: {anomaly.ward_name || 'Unknown'}</p>
                    <p>PU: {anomaly.polling_unit_name || 'Unknown'}</p>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-6 right-6 z-[1000] bg-dark-surface/90 backdrop-blur-md p-3 rounded-lg border border-dark-border shadow-xl">
        <h4 className="text-xs font-semibold text-text-primary mb-2">Severity Legend</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-xs text-text-muted">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <span className="text-xs text-text-muted">High</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="text-xs text-text-muted">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500"></span>
            <span className="text-xs text-text-muted">Warning</span>
          </div>
        </div>
      </div>
    </div>
  );
}
