import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Ship, Navigation as NavigationIcon, TrendingDown, MapPin, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MapView } from "@/components/Map";

type PortOption = {
  name: string;
  country: string;
  code: string;
  latitude: number;
  longitude: number;
};

type PortSelectorProps = {
  label: string;
  selectedCountry: string | null;
  selectedPortCode: string | null;
  onCountryChange: (country: string) => void;
  onPortChange: (port: PortOption) => void;
  countries: string[];
  portsByCountry: Record<string, PortOption[]>;
  loading?: boolean;
  error?: string | null;
};

function PortSelector({
  label,
  selectedCountry,
  selectedPortCode,
  onCountryChange,
  onPortChange,
  countries,
  portsByCountry,
  loading,
  error,
}: PortSelectorProps) {
  const countryPorts = selectedCountry ? portsByCountry[selectedCountry] ?? [] : [];

  const countryPlaceholder = loading
    ? "Ülkeler yükleniyor..."
    : error
      ? "Ülke verisi alınamadı"
      : countries.length > 0
        ? "Ülke seçin"
        : "Ülke bulunamadı";

  const portPlaceholder = !selectedCountry
    ? "Önce ülke seçin"
    : loading
      ? "Limanlar yükleniyor..."
      : error
        ? "Limanlar alınamadı"
        : countryPorts.length > 0
          ? "Şehir/Liman seçin"
          : "Bu ülkeye ait liman yok";

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        {label}
      </Label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select
          value={selectedCountry ?? undefined}
          onValueChange={(value) => {
            onCountryChange(value);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={countryPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {loading ? (
              <SelectItem value="loading" disabled className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ülkeler yükleniyor...
              </SelectItem>
            ) : error ? (
              <SelectItem value="error" disabled>
                Ülke verisi alınamadı
              </SelectItem>
            ) : countries.length > 0 ? (
              countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="empty" disabled>
                Ülke bulunamadı
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select
          value={selectedPortCode ?? undefined}
          onValueChange={(value) => {
            const port = countryPorts.find((p) => p.code === value);
            if (port) {
              onPortChange(port);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={portPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {!selectedCountry ? (
              <SelectItem value="select-country" disabled>
                Önce ülke seçin
              </SelectItem>
            ) : loading ? (
              <SelectItem value="loading" disabled className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Limanlar yükleniyor...
              </SelectItem>
            ) : error ? (
              <SelectItem value="error" disabled>
                Liman verisi alınamadı
              </SelectItem>
            ) : countryPorts.length > 0 ? (
              countryPorts.map((port) => (
                <SelectItem key={port.code} value={port.code}>
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{port.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {port.code} • {port.latitude.toFixed(2)}, {port.longitude.toFixed(2)}
                    </span>
                  </div>
                </SelectItem>
              ))
            ) : (
              <SelectItem value="empty" disabled>
                Bu ülkeye ait liman yok
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function RouteOptimization() {
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [startLat, setStartLat] = useState("");
  const [startLon, setStartLon] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLon, setEndLon] = useState("");
  const [startPortLabel, setStartPortLabel] = useState<string | null>(null);
  const [endPortLabel, setEndPortLabel] = useState<string | null>(null);
  const [startCountry, setStartCountry] = useState<string | null>(null);
  const [endCountry, setEndCountry] = useState<string | null>(null);
  const [startPortCode, setStartPortCode] = useState<string | null>(null);
  const [endPortCode, setEndPortCode] = useState<string | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const googleRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const routeMarkersRef = useRef<any[]>([]);
  const startMarkerRef = useRef<any>(null);
  const endMarkerRef = useRef<any>(null);

  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.list.useQuery();
  const { data: routes } = trpc.routes.list.useQuery();
  const {
    data: ports,
    isLoading: portsLoading,
    isFetching: portsFetching,
    error: portsError,
  } = trpc.ports.list.useQuery(
    { limit: 1000 },
    {
      retry: 1,
      onError: (err) => {
        toast.error(`Liman verisi alınamadı: ${err.message}`);
      },
    },
  );

  const isPortsLoading = portsLoading || portsFetching;

  const portsByCountry = useMemo(() => {
    const grouped: Record<string, PortOption[]> = {};
    (ports ?? []).forEach((port) => {
      grouped[port.country] = grouped[port.country] || [];
      grouped[port.country].push(port);
    });

    Object.keys(grouped).forEach((country) => {
      grouped[country] = grouped[country].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [ports]);

  const countries = useMemo(() => Object.keys(portsByCountry).sort((a, b) => a.localeCompare(b)), [portsByCountry]);

  const formatPortLabel = (port: PortOption) => `${port.name} (${port.code})`;

  const handlePortSelect = (port: PortOption, type: "start" | "end") => {
    const portLabel = formatPortLabel(port);
    if (type === "start") {
      setStartCountry(port.country);
      setStartPortCode(port.code);
      setStartLat(port.latitude.toString());
      setStartLon(port.longitude.toString());
      setStartPortLabel(portLabel);
    } else {
      setEndCountry(port.country);
      setEndPortCode(port.code);
      setEndLat(port.latitude.toString());
      setEndLon(port.longitude.toString());
      setEndPortLabel(portLabel);
    }
  };

  const handleCountryChange = (country: string, type: "start" | "end") => {
    if (type === "start") {
      setStartCountry(country);
      setStartPortCode(null);
      setStartPortLabel(null);
      setStartLat("");
      setStartLon("");
    } else {
      setEndCountry(country);
      setEndPortCode(null);
      setEndPortLabel(null);
      setEndLat("");
      setEndLon("");
    }
  };

  useEffect(() => {
    if (!ports || ports.length === 0) return;

    if (!startPortCode) {
      const defaultStart = ports.find((p) => p.code === "TRIST") ?? ports[0];
      if (defaultStart) {
        handlePortSelect(defaultStart, "start");
      }
    }

    if (!endPortCode) {
      const defaultEnd = ports.find((p) => p.code === "ITNAP") ?? ports[1] ?? ports[0];
      if (defaultEnd) {
        handlePortSelect(defaultEnd, "end");
      }
    }
  }, [ports, startPortCode, endPortCode]);

  const updateEndpointMarkers = () => {
    if (!mapRef.current || !googleRef.current) return;

    const google = googleRef.current;
    const map = mapRef.current;
    const startLatNum = parseFloat(startLat);
    const startLonNum = parseFloat(startLon);
    const endLatNum = parseFloat(endLat);
    const endLonNum = parseFloat(endLon);

    if ([startLatNum, startLonNum, endLatNum, endLonNum].some((value) => Number.isNaN(value))) {
      return;
    }

    const startPosition = new google.maps.LatLng(startLatNum, startLonNum);
    const endPosition = new google.maps.LatLng(endLatNum, endLonNum);

    if (!startMarkerRef.current) {
      startMarkerRef.current = new google.maps.Marker({
        position: startPosition,
        map,
        title: startPortLabel ? `Başlangıç: ${startPortLabel}` : "Başlangıç",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      });
    } else {
      startMarkerRef.current.setPosition(startPosition);
      startMarkerRef.current.setTitle(startPortLabel ? `Başlangıç: ${startPortLabel}` : "Başlangıç");
    }

    if (!endMarkerRef.current) {
      endMarkerRef.current = new google.maps.Marker({
        position: endPosition,
        map,
        title: endPortLabel ? `Varış: ${endPortLabel}` : "Varış",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      });
    } else {
      endMarkerRef.current.setPosition(endPosition);
      endMarkerRef.current.setTitle(endPortLabel ? `Varış: ${endPortLabel}` : "Varış");
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(startPosition);
    bounds.extend(endPosition);
    map.fitBounds(bounds);
  };

  useEffect(() => {
    updateEndpointMarkers();
  }, [startLat, startLon, endLat, endLon, startPortLabel, endPortLabel]);

  const geneticMutation = trpc.optimization.runGenetic.useMutation({
    onMutate: () => {
      setProgress(0);
      setProgressMessage("🧬 Populasyon oluşturuluyor...");
      // Simüle edilmiş ilerleme
      let currentGen = 0;
      const interval = setInterval(() => {
        currentGen += 5;
        setProgress(Math.min((currentGen / 50) * 100, 90));
        setProgressMessage(`🧬 Nesil ${currentGen}/50 - Evrim devam ediyor...`);
        if (currentGen >= 50) clearInterval(interval);
      }, 800);
      return { interval };
    },
    onSuccess: (data, _vars, context: any) => {
      if (context?.interval) clearInterval(context.interval);
      setProgress(100);
      setProgressMessage("✅ Genetik optimizasyon tamamlandı!");
      toast.success(`Genetik optimizasyon tamamlandı! Yakıt: ${(data.totalFuel || 0).toFixed(2)} ton`);
      setOptimizedRoute(data);
      drawRouteOnMap(data);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage("");
      }, 2000);
    },
    onError: (error, _vars, context: any) => {
      if (context?.interval) clearInterval(context.interval);
      setProgress(0);
      setProgressMessage("");
      toast.error(`Hata: ${error.message}`);
    },
  });

  const drawRouteOnMap = (routeData: any) => {
    if (!mapRef.current || !googleRef.current || !routeData.path) return;
    
    const google = googleRef.current;
    const map = mapRef.current;
    
    // Eski polyline'ı temizle
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
    }

    // Önceki waypoint marker'larını temizle
    routeMarkersRef.current.forEach((marker) => marker.setMap(null));
    routeMarkersRef.current = [];

    // Rota koordinatlarını hazırla
    const pathCoordinates = routeData.path.map((point: any) => ({
      lat: point.lat,
      lng: point.lon,
    }));
    
    // Yeşil şerit (polyline) çiz
    const routePolyline = new google.maps.Polyline({
      path: pathCoordinates,
      geodesic: true,
      strokeColor: "#22c55e", // Yeşil renk
      strokeOpacity: 0.8,
      strokeWeight: 5,
      map: map,
    });
    
    routePolylineRef.current = routePolyline;
    
    // Haritayı rotaya göre ayarla
    const bounds = new google.maps.LatLngBounds();
    pathCoordinates.forEach((coord: any) => bounds.extend(coord));
    map.fitBounds(bounds);

    // Waypoint'leri işaretle
    const startTitle = startPortLabel ? `Başlangıç: ${startPortLabel}` : "Başlangıç";
    const endTitle = endPortLabel ? `Varış: ${endPortLabel}` : "Varış";
    routeData.path.forEach((point: any, index: number) => {
      if (index === 0 || index === routeData.path.length - 1 || index % 5 === 0) {
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lon },
          map: map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: index === 0 || index === routeData.path.length - 1 ? 8 : 4,
            fillColor: index === 0 ? "#22c55e" : index === routeData.path.length - 1 ? "#ef4444" : "#3b82f6",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          title: index === 0 ? startTitle : index === routeData.path.length - 1 ? endTitle : `Waypoint ${index}`,
        });

        routeMarkersRef.current.push(marker);
      }
    });
  };

  useEffect(() => {
    if (mapReady && optimizedRoute) {
      drawRouteOnMap(optimizedRoute);
    }
  }, [mapReady, optimizedRoute]);

  const handleOptimize = () => {
    if (!selectedVessel) {
      toast.error("Lütfen bir gemi seçin");
      return;
    }

    if ([startLat, startLon, endLat, endLon].some((value) => value === "")) {
      toast.error("Lütfen başlangıç ve varış limanlarını seçin");
      return;
    }

    geneticMutation.mutate({
      vesselId: selectedVessel,
      startLat: parseFloat(startLat),
      startLon: parseFloat(startLon),
      endLat: parseFloat(endLat),
      endLon: parseFloat(endLon),
      populationSize: 20,
      generations: 15,
      weatherEnabled: true,
    });
  };

  const isOptimizing = geneticMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Yeşil Deniz Taşımacılığı
          </h1>
          <p className="text-lg text-gray-600">
            Yapay Zeka Destekli Rota Optimizasyonu ve Sürdürülebilirlik
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sol Panel - Parametreler */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="w-5 h-5" />
                Optimizasyon Parametreleri
              </CardTitle>
              <CardDescription>
                Rota optimizasyonu için gerekli bilgileri girin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Gemi Seçimi */}
              <div className="space-y-2">
                <Label>Gemi</Label>
                <Select
                  value={selectedVessel?.toString()}
                  onValueChange={(v) => setSelectedVessel(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gemi seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {vesselsLoading ? (
                      <SelectItem value="loading" disabled>Yükleniyor...</SelectItem>
                    ) : vessels && vessels.length > 0 ? (
                      vessels.map((vessel) => (
                        <SelectItem key={vessel.id} value={vessel.id.toString()}>
                          {vessel.name} ({vessel.vesselType})
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>Gemi bulunamadı</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Başlangıç Noktası */}
              <div className="space-y-3">
                <PortSelector
                  label="Başlangıç Limanı"
                  selectedCountry={startCountry}
                  selectedPortCode={startPortCode}
              onCountryChange={(country) => handleCountryChange(country, "start")}
              onPortChange={(port) => handlePortSelect(port, "start")}
              countries={countries}
              portsByCountry={portsByCountry}
              loading={isPortsLoading}
              error={portsError?.message ?? null}
            />

                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-900">
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin className="w-4 h-4" />
                    Başlangıç Koordinatları
                  </div>
                  <p className="mt-1 text-emerald-800">
                    {startLat && startLon
                      ? `${parseFloat(startLat).toFixed(4)}, ${parseFloat(startLon).toFixed(4)}`
                      : "Lütfen bir liman seçin"}
                  </p>
                </div>
              </div>

              {/* Varış Noktası */}
              <div className="space-y-3">
                <PortSelector
                  label="Varış Limanı"
                  selectedCountry={endCountry}
                  selectedPortCode={endPortCode}
              onCountryChange={(country) => handleCountryChange(country, "end")}
              onPortChange={(port) => handlePortSelect(port, "end")}
              countries={countries}
              portsByCountry={portsByCountry}
              loading={isPortsLoading}
              error={portsError?.message ?? null}
            />

                <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-sm text-rose-900">
                  <div className="flex items-center gap-2 font-medium">
                    <MapPin className="w-4 h-4" />
                    Varış Koordinatları
                  </div>
                  <p className="mt-1 text-rose-800">
                    {endLat && endLon
                      ? `${parseFloat(endLat).toFixed(4)}, ${parseFloat(endLon).toFixed(4)}`
                      : "Lütfen bir liman seçin"}
                  </p>
                </div>
              </div>

              {/* Optimizasyon Butonu */}
              <Button
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="w-full"
                size="lg"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Optimizasyon Yapılıyor...
                  </>
                ) : (
                  <>
                    <NavigationIcon className="mr-2 h-4 w-4" />
                    Rotayı Optimize Et
                  </>
                )}
              </Button>
              
              {/* İlerleme Göstergesi */}
              {isOptimizing && progress > 0 && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600 animate-pulse" />
                    <span className="text-sm font-medium text-blue-800">
                      {progressMessage}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="text-xs text-blue-600 text-right">
                    {progress.toFixed(0)}% tamamlandı
                  </div>
                </div>
              )}
              
              {optimizedRoute && !isOptimizing && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-sm font-medium text-green-800 mb-1">
                    ✓ Rota Optimize Edildi
                  </div>
                  <div className="text-xs text-green-600">
                    {optimizedRoute.path?.length || 0} waypoint hesaplandı
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sağ Panel - Harita ve Sonuçlar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Harita */}
            <Card>
              <CardHeader>
                <CardTitle>Rota Haritası</CardTitle>
                <CardDescription>
                  Yeşil şerit optimize edilmiş rotayı gösterir
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] bg-gray-100 rounded-lg overflow-hidden">
                  <MapView
                    onMapReady={(map: any) => {
                      const google = (window as any).google;
                      mapRef.current = map;
                      googleRef.current = google;
                      setMapReady(true);
                      updateEndpointMarkers();
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Sonuçlar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5" />
                  Optimizasyon Sonuçları
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="latest">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="latest">Son Sonuç</TabsTrigger>
                    <TabsTrigger value="history">Geçmiş Rotalar</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="latest" className="space-y-4">
                    {optimizedRoute ? (
                      <div className="space-y-4">
                        {/* Temel Metrikler */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-blue-50 rounded-lg">
                            <div className="text-sm text-gray-600">Toplam Mesafe</div>
                            <div className="text-2xl font-bold text-blue-700">
                              {(optimizedRoute.totalDistance || 0).toFixed(1)} nm
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {((optimizedRoute.totalDistance || 0) * 1.852).toFixed(1)} km
                            </div>
                          </div>
                          <div className="p-4 bg-green-50 rounded-lg">
                            <div className="text-sm text-gray-600">Yakıt Tüketimi</div>
                            <div className="text-2xl font-bold text-green-700">
                              {(optimizedRoute.totalFuel || 0).toFixed(2)} ton
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              ≈ ${((optimizedRoute.totalFuel || 0) * 600).toLocaleString()} maliyet
                            </div>
                          </div>
                          <div className="p-4 bg-orange-50 rounded-lg">
                            <div className="text-sm text-gray-600">CO₂ Emisyonu</div>
                            <div className="text-2xl font-bold text-orange-700">
                              {(optimizedRoute.totalCO2 || 0).toFixed(2)} ton
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Karbon ayak izi
                            </div>
                          </div>
                          <div className="p-4 bg-purple-50 rounded-lg">
                            <div className="text-sm text-gray-600">Seyahat Süresi</div>
                            <div className="text-2xl font-bold text-purple-700">
                              {(optimizedRoute.totalDuration || 0).toFixed(1)} saat
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {Math.floor((optimizedRoute.totalDuration || 0) / 24)} gün {Math.floor((optimizedRoute.totalDuration || 0) % 24)} saat
                            </div>
                          </div>
                        </div>

                        {/* ETA ve Zaman Bilgileri */}
                        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-200">
                          <div className="text-sm font-medium text-indigo-900 mb-3">
                            📅 Zaman Tahmini
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-600">Kalkış Zamanı</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {new Date().toLocaleString('tr-TR', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric',
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600">Tahmini Varış (ETA)</div>
                              <div className="text-sm font-semibold text-indigo-700">
                                {new Date(Date.now() + (optimizedRoute.totalDuration || 0) * 3600000).toLocaleString('tr-TR', { 
                                  day: '2-digit', 
                                  month: 'short', 
                                  year: 'numeric',
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Performans Metrikleri */}
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="text-sm font-medium text-gray-900 mb-3">
                            📊 Performans Metrikleri
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                              <div className="text-xs text-gray-600">Ortalama Hız</div>
                              <div className="text-lg font-bold text-gray-900">
                                {((optimizedRoute.totalDistance || 0) / (optimizedRoute.totalDuration || 1)).toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-500">knot</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600">Yakıt Verimliliği</div>
                              <div className="text-lg font-bold text-gray-900">
                                {((optimizedRoute.totalFuel || 0) / (optimizedRoute.totalDistance || 1) * 100).toFixed(2)}
                              </div>
                              <div className="text-xs text-gray-500">ton/100nm</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600">Waypoint Sayısı</div>
                              <div className="text-lg font-bold text-gray-900">
                                {optimizedRoute.path?.length || 0}
                              </div>
                              <div className="text-xs text-gray-500">nokta</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        Henüz optimizasyon yapılmadı
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="history">
                    <div className="space-y-2">
                      {routes && routes.length > 0 ? (
                        routes.slice(0, 5).map((route) => (
                          <div key={route.id} className="p-3 border rounded-lg hover:bg-gray-50">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium">{route.name}</div>
                                <div className="text-sm text-gray-500">
                                  {route.algorithm} - {route.totalDistance} nm
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  {(route.totalFuelConsumption || 0) / 100} ton
                                </div>
                                <div className="text-xs text-gray-500">
                                  CO₂: {(route.totalCO2Emission || 0) / 100} ton
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          Henüz kayıtlı rota yok
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
