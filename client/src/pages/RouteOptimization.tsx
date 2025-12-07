import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Ship, Navigation as NavigationIcon, TrendingDown, MapPin, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { MapView } from "@/components/Map";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type PortOption = {
  name: string;
  country: string;
  code: string;
  latitude: number;
  longitude: number;
};

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

type PortComboboxProps = {
  label: string;
  placeholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ports?: PortOption[];
  loading?: boolean;
  selectedLabel?: string | null;
  onSelect: (port: PortOption) => void;
  minCharsReached: boolean;
};

function PortCombobox({
  label,
  placeholder,
  searchValue,
  onSearchChange,
  open,
  onOpenChange,
  ports,
  loading,
  selectedLabel,
  onSelect,
  minCharsReached,
}: PortComboboxProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        {label}
      </Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex flex-col items-start text-left">
              <span className="font-medium">{selectedLabel ?? placeholder}</span>
              <span className="text-xs text-muted-foreground">İsim, ülke veya UN/LOCODE ile arayın</span>
            </div>
            <MapPin className="w-4 h-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[320px]" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Liman ara..."
              value={searchValue}
              onValueChange={onSearchChange}
            />
            <CommandList>
              <CommandEmpty>
                {loading
                  ? "Limanlar yükleniyor..."
                  : minCharsReached
                    ? "Sonuç bulunamadı"
                    : "Arama için en az 2 karakter yazın"}
              </CommandEmpty>
              <CommandGroup heading="Sonuçlar">
                <ScrollArea className="max-h-64">
                  {(ports ?? []).map((port) => (
                    <CommandItem
                      key={`${port.code}-${port.name}`}
                      value={`${port.code}-${port.name}`}
                      onSelect={() => {
                        onSelect(port);
                        onOpenChange(false);
                      }}
                      className="flex-col items-start gap-1"
                    >
                      <span className="font-medium">{port.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {port.country} • {port.code} • {port.latitude.toFixed(4)}, {port.longitude.toFixed(4)}
                      </span>
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function RouteOptimization() {
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [startLat, setStartLat] = useState("41.0082"); // İstanbul
  const [startLon, setStartLon] = useState("28.9784");
  const [endLat, setEndLat] = useState("40.8518"); // Napoli
  const [endLon, setEndLon] = useState("14.2681");
  const [startPortLabel, setStartPortLabel] = useState<string | null>(null);
  const [endPortLabel, setEndPortLabel] = useState<string | null>(null);
  const [startPortSearch, setStartPortSearch] = useState("");
  const [endPortSearch, setEndPortSearch] = useState("");
  const [startPortOpen, setStartPortOpen] = useState(false);
  const [endPortOpen, setEndPortOpen] = useState(false);
  const startSearchTerm = useDebouncedValue(startPortSearch, 400);
  const endSearchTerm = useDebouncedValue(endPortSearch, 400);
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
  const { data: defaultPorts, isLoading: defaultPortsLoading } = trpc.ports.list.useQuery({ limit: 20 });
  const { data: startPortResults, isFetching: startPortsFetching } = trpc.ports.search.useQuery(
    { query: startSearchTerm, limit: 20 },
    { enabled: startSearchTerm.trim().length >= 2 }
  );
  const { data: endPortResults, isFetching: endPortsFetching } = trpc.ports.search.useQuery(
    { query: endSearchTerm, limit: 20 },
    { enabled: endSearchTerm.trim().length >= 2 }
  );

  const minStartQuery = startSearchTerm.trim().length >= 2;
  const minEndQuery = endSearchTerm.trim().length >= 2;
  const startPorts = minStartQuery ? startPortResults : defaultPorts;
  const endPorts = minEndQuery ? endPortResults : defaultPorts;
  const startPortsLoading = minStartQuery ? startPortsFetching : defaultPortsLoading;
  const endPortsLoading = minEndQuery ? endPortsFetching : defaultPortsLoading;

  const formatPortLabel = (port: PortOption) => `${port.name} (${port.code})`;

  const handlePortSelect = (port: PortOption, type: "start" | "end") => {
    const portLabel = formatPortLabel(port);
    if (type === "start") {
      setStartLat(port.latitude.toString());
      setStartLon(port.longitude.toString());
      setStartPortLabel(portLabel);
      setStartPortSearch(portLabel);
      setStartPortOpen(false);
    } else {
      setEndLat(port.latitude.toString());
      setEndLon(port.longitude.toString());
      setEndPortLabel(portLabel);
      setEndPortSearch(portLabel);
      setEndPortOpen(false);
    }
  };

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
                <PortCombobox
                  label="Başlangıç Limanı"
                  placeholder="Liman seçin veya arayın"
                  searchValue={startPortSearch}
                  onSearchChange={setStartPortSearch}
                  open={startPortOpen}
                  onOpenChange={setStartPortOpen}
                  ports={startPorts}
                  loading={startPortsLoading}
                  selectedLabel={startPortLabel}
                  onSelect={(port) => handlePortSelect(port, "start")}
                  minCharsReached={startPortSearch.trim().length >= 2}
                />

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-green-600" />
                    Başlangıç Koordinatları
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="Enlem"
                      value={startLat}
                      onChange={(e) => setStartLat(e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="Boylam"
                      value={startLon}
                      onChange={(e) => setStartLon(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Varış Noktası */}
              <div className="space-y-3">
                <PortCombobox
                  label="Varış Limanı"
                  placeholder="Liman seçin veya arayın"
                  searchValue={endPortSearch}
                  onSearchChange={setEndPortSearch}
                  open={endPortOpen}
                  onOpenChange={setEndPortOpen}
                  ports={endPorts}
                  loading={endPortsLoading}
                  selectedLabel={endPortLabel}
                  onSelect={(port) => handlePortSelect(port, "end")}
                  minCharsReached={endPortSearch.trim().length >= 2}
                />

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-red-600" />
                    Varış Koordinatları
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="Enlem"
                      value={endLat}
                      onChange={(e) => setEndLat(e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="Boylam"
                      value={endLon}
                      onChange={(e) => setEndLon(e.target.value)}
                    />
                  </div>
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
