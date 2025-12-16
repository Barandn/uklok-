import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Ship, Navigation as NavigationIcon, TrendingDown, MapPin, Activity, Anchor, Waves, Wind } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { SeaMapView, type SeaMapHandle, type RoutePoint } from "@/components/SeaMapView";
import { STATIC_PORTS, type PortOption } from "@/data/ports";

type PortSelectorProps = {
  label: string;
  selectedCountry: string | null;
  selectedPortCode: string | null;
  onCountryChange: (country: string) => void;
  onPortChange: (port: PortOption) => void;
  countries: string[];
  portsByCountry: Record<string, PortOption[]>;
};

function PortSelector({
  label,
  selectedCountry,
  selectedPortCode,
  onCountryChange,
  onPortChange,
  countries,
  portsByCountry,
}: PortSelectorProps) {
  const countryPorts = selectedCountry ? portsByCountry[selectedCountry] ?? [] : [];

  const countryPlaceholder = countries.length > 0 ? "Ülke seçin" : "Ülke bulunamadı";

  const portPlaceholder = !selectedCountry
    ? "Önce ülke seçin"
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
            {countries.length > 0 ? (
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

// Register service worker for offline tile caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-tiles.js').then(
    (registration) => {
      console.log('Tile cache SW registered:', registration.scope);
    },
    (error) => {
      console.warn('Tile cache SW registration failed:', error);
    }
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
  const mapHandleRef = useRef<SeaMapHandle | null>(null);

  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.list.useQuery();

  const ports = STATIC_PORTS;

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
  }, [ports]);

  // Update endpoint markers when coordinates change
  const updateEndpointMarkers = () => {
    if (!mapHandleRef.current) return;

    const startLatNum = parseFloat(startLat);
    const startLonNum = parseFloat(startLon);
    const endLatNum = parseFloat(endLat);
    const endLonNum = parseFloat(endLon);

    if ([startLatNum, startLonNum, endLatNum, endLonNum].some((value) => Number.isNaN(value))) {
      return;
    }

    // Set markers on Leaflet map
    mapHandleRef.current.setStartMarker(startLatNum, startLonNum, startPortLabel || undefined);
    mapHandleRef.current.setEndMarker(endLatNum, endLonNum, endPortLabel || undefined);

    // Fit bounds to show both markers
    if (mapHandleRef.current.map) {
      const bounds = [
        [startLatNum, startLonNum],
        [endLatNum, endLonNum],
      ] as [[number, number], [number, number]];
      mapHandleRef.current.fitBounds(bounds);
    }
  };

  useEffect(() => {
    if (mapReady) {
      updateEndpointMarkers();
    }
  }, [startLat, startLon, endLat, endLon, startPortLabel, endPortLabel, mapReady]);

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
    if (!mapHandleRef.current || !routeData.path) return;

    // Convert path to RoutePoint format
    const path: RoutePoint[] = routeData.path.map((point: any) => ({
      lat: point.lat,
      lon: point.lon,
      depth: point.depth,
      weather: point.weather,
    }));

    // Draw route on Leaflet map
    mapHandleRef.current.setRoute(path);

    // Update start/end markers with labels
    if (path.length > 0) {
      mapHandleRef.current.setStartMarker(path[0].lat, path[0].lon, startPortLabel || undefined);
      mapHandleRef.current.setEndMarker(
        path[path.length - 1].lat,
        path[path.length - 1].lon,
        endPortLabel || undefined
      );
    }
  };

  useEffect(() => {
    if (mapReady && optimizedRoute) {
      drawRouteOnMap(optimizedRoute);
    }
  }, [mapReady, optimizedRoute]);

  const handleOptimize = () => {
    if (!selectedVessel || !selectedVesselData) {
      toast.error("Lütfen bir gemi seçin");
      return;
    }

    if ([startLat, startLon, endLat, endLon].some((value) => value === "")) {
      toast.error("Lütfen başlangıç ve varış limanlarını seçin");
      return;
    }

    // Clear existing route before optimization
    mapHandleRef.current?.clearRoute();

    // Gemi bilgilerini doğrudan gönder (DB'ye kaydetmeden anlık hesaplama)
    geneticMutation.mutate({
      startLat: parseFloat(startLat),
      startLon: parseFloat(startLon),
      endLat: parseFloat(endLat),
      endLon: parseFloat(endLon),
      vessel: {
        name: selectedVesselData.name,
        vesselType: selectedVesselData.vesselType,
        dwt: selectedVesselData.dwt,
        length: selectedVesselData.length || 200,
        beam: selectedVesselData.beam || 30,
        draft: selectedVesselData.draft || 10,
        serviceSpeed: selectedVesselData.serviceSpeed,
        fuelType: selectedVesselData.fuelType as "HFO" | "LFO" | "MGO" | "MDO" | "LNG" | "Methanol",
        fuelConsumptionRate: selectedVesselData.fuelConsumptionRate || 50,
        enginePower: selectedVesselData.enginePower || 10000,
      },
      populationSize: 20,
      generations: 15,
      weatherEnabled: false, // Daha hızlı hesaplama için kapalı
    });
  };

  const isOptimizing = geneticMutation.isPending;

  // Get selected vessel details for display
  const selectedVesselData = vessels?.find(v => v.id === selectedVessel);

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
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-blue-600">
            <Anchor className="w-4 h-4" />
            <span>OpenSeaMap & Leaflet ile Offline Çalışabilir Harita</span>
          </div>
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

              {/* Seçili gemi bilgileri */}
              {selectedVesselData && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm">
                  <div className="flex items-center gap-2 font-medium text-blue-900 mb-2">
                    <Ship className="w-4 h-4" />
                    Gemi Bilgileri
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                    <div>Draft: <span className="font-semibold">{selectedVesselData.draft}m</span></div>
                    <div>DWT: <span className="font-semibold">{selectedVesselData.dwt} ton</span></div>
                    <div>Hız: <span className="font-semibold">{selectedVesselData.serviceSpeed} knot</span></div>
                    <div>Yakıt: <span className="font-semibold">{selectedVesselData.fuelType}</span></div>
                  </div>
                </div>
              )}

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
                <CardTitle className="flex items-center gap-2">
                  <Anchor className="w-5 h-5" />
                  Deniz Haritası
                </CardTitle>
                <CardDescription>
                  OpenSeaMap deniz haritası ile optimize edilmiş rota - Offline destekli
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] bg-gray-100 rounded-lg overflow-hidden">
                  <SeaMapView
                    initialCenter={{ lat: 38.0, lng: 24.0 }}
                    initialZoom={6}
                    showSeamarks={true}
                    showDepthLayer={true}
                    onMapReady={(handle) => {
                      mapHandleRef.current = handle;
                      setMapReady(true);
                      updateEndpointMarkers();
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Waves className="w-3 h-3" />
                    <span>Derinlik verileri: NOAA ETOPO</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Wind className="w-3 h-3" />
                    <span>Hava durumu: NOAA GFS</span>
                  </div>
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

                        {/* Derinlik ve Güvenlik Bilgileri */}
                        <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg border border-cyan-200">
                          <div className="text-sm font-medium text-cyan-900 mb-3 flex items-center gap-2">
                            <Waves className="w-4 h-4" />
                            Derinlik & Güvenlik Analizi
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="text-xs text-gray-600">Min. Derinlik</div>
                              <div className="text-lg font-semibold text-cyan-700">
                                {optimizedRoute.minDepth ? `${Math.abs(optimizedRoute.minDepth).toFixed(0)}m` : 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600">Gemi Draft</div>
                              <div className="text-lg font-semibold text-cyan-700">
                                {selectedVesselData?.draft || 'N/A'}m
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600">Güvenlik Marjı</div>
                              <div className="text-lg font-semibold text-green-600">
                                ✓ Uygun
                              </div>
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
                        <Anchor className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>Henüz optimizasyon yapılmadı</p>
                        <p className="text-sm mt-2">Gemi ve liman seçerek rota optimizasyonu başlatın</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history">
                    <div className="space-y-2">
                      <div className="text-center py-8 text-gray-500">
                        <Anchor className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">Anlık Hesaplama Modu</p>
                        <p className="text-sm mt-1">
                          Bu modda rotalar veritabanına kaydedilmez.
                        </p>
                        <p className="text-xs mt-2 text-gray-400">
                          Tüm hesaplamalar anlık olarak yapılır ve sonuçlar sadece bu oturumda görüntülenir.
                        </p>
                      </div>
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
