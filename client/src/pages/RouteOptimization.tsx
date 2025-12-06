import { useState, useRef } from "react";
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

export default function RouteOptimization() {
  const [selectedVessel, setSelectedVessel] = useState<number | null>(null);
  const [startLat, setStartLat] = useState("41.0082"); // İstanbul
  const [startLon, setStartLon] = useState("28.9784");
  const [endLat, setEndLat] = useState("40.8518"); // Napoli
  const [endLon, setEndLon] = useState("14.2681");
  const [algorithm, setAlgorithm] = useState<"astar" | "genetic">("genetic");
  const [optimizedRoute, setOptimizedRoute] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  
  const mapRef = useRef<any>(null);
  const googleRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  
  const { data: vessels, isLoading: vesselsLoading } = trpc.vessels.list.useQuery();
  const { data: routes } = trpc.routes.list.useQuery();
  
  const simpleMutation = trpc.optimization.runSimple.useMutation({
    onSuccess: (data) => {
      toast.success(`Rota oluşturuldu! Yakıt: ${(data.totalFuel || 0).toFixed(2)} ton`);
      setOptimizedRoute(data);
      drawRouteOnMap(data);
    },
    onError: (error) => {
      toast.error(`Hata: ${error.message}`);
    },
  });
  
  const astarMutation = trpc.optimization.runAstar.useMutation({
    onMutate: () => {
      setProgress(0);
      setProgressMessage("İlk nokta belirleniyor...");
      // Simüle edilmiş ilerleme
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);
      return { interval };
    },
    onSuccess: (data, _vars, context: any) => {
      if (context?.interval) clearInterval(context.interval);
      setProgress(100);
      setProgressMessage("✅ Optimizasyon tamamlandı!");
      toast.success(`A* optimizasyonu tamamlandı! Yakıt: ${(data.totalFuel || 0).toFixed(2)} ton`);
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
    routeData.path.forEach((point: any, index: number) => {
      if (index === 0 || index === routeData.path.length - 1 || index % 5 === 0) {
        new google.maps.Marker({
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
          title: index === 0 ? "Başlangıç" : index === routeData.path.length - 1 ? "Varış" : `Waypoint ${index}`,
        });
      }
    });
  };

  const handleOptimize = () => {
    if (!selectedVessel) {
      toast.error("Lütfen bir gemi seçin");
      return;
    }

    const params = {
      vesselId: selectedVessel,
      startLat: parseFloat(startLat),
      startLon: parseFloat(startLon),
      endLat: parseFloat(endLat),
      endLon: parseFloat(endLon),
      weatherEnabled: true,
    };

    // Basit rota kullan (hızlı)
    simpleMutation.mutate({
      vesselId: selectedVessel,
      startLat: parseFloat(startLat),
      startLon: parseFloat(startLon),
      endLat: parseFloat(endLat),
      endLon: parseFloat(endLon),
    });
  };

  const isOptimizing = simpleMutation.isPending || astarMutation.isPending || geneticMutation.isPending;

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
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-600" />
                  Başlangıç Noktası
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

              {/* Varış Noktası */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-600" />
                  Varış Noktası
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

              {/* Algoritma Seçimi */}
              <div className="space-y-2">
                <Label>Optimizasyon Algoritması</Label>
                <Select value={algorithm} onValueChange={(v: any) => setAlgorithm(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="astar">A* Algoritması</SelectItem>
                    <SelectItem value="genetic">Genetik Algoritma</SelectItem>
                  </SelectContent>
                </Select>
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
                      
                      // Başlangıç ve bitiş noktalarını işaretle
                      const start = new google.maps.LatLng(
                        parseFloat(startLat),
                        parseFloat(startLon)
                      );
                      const end = new google.maps.LatLng(
                        parseFloat(endLat),
                        parseFloat(endLon)
                      );

                      new google.maps.Marker({
                        position: start,
                        map: map,
                        title: "Başlangıç",
                        icon: {
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 10,
                          fillColor: "#22c55e",
                          fillOpacity: 1,
                          strokeColor: "#fff",
                          strokeWeight: 3,
                        },
                      });

                      new google.maps.Marker({
                        position: end,
                        map: map,
                        title: "Varış",
                        icon: {
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 10,
                          fillColor: "#ef4444",
                          fillOpacity: 1,
                          strokeColor: "#fff",
                          strokeWeight: 3,
                        },
                      });

                      const bounds = new google.maps.LatLngBounds();
                      bounds.extend(start);
                      bounds.extend(end);
                      map.fitBounds(bounds);
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
