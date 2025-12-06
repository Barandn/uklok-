import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Ship, Plus, Trash2 } from "lucide-react";

export default function Vessels() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    vesselType: "Container",
    dwt: "",
    length: "",
    beam: "",
    draft: "",
    serviceSpeed: "",
    fuelType: "HFO" as const,
    fuelConsumptionRate: "",
    enginePower: "",
  });

  const utils = trpc.useUtils();
  const { data: vessels, isLoading } = trpc.vessels.list.useQuery();

  const createMutation = trpc.vessels.create.useMutation({
    onSuccess: () => {
      toast.success("Gemi başarıyla eklendi");
      utils.vessels.list.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Hata: ${error.message}`);
    },
  });

  const deleteMutation = trpc.vessels.delete.useMutation({
    onSuccess: () => {
      toast.success("Gemi silindi");
      utils.vessels.list.invalidate();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      vesselType: "Container",
      dwt: "",
      length: "",
      beam: "",
      draft: "",
      serviceSpeed: "",
      fuelType: "HFO",
      fuelConsumptionRate: "",
      enginePower: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: formData.name,
      vesselType: formData.vesselType,
      dwt: parseInt(formData.dwt),
      length: formData.length ? parseInt(formData.length) : undefined,
      beam: formData.beam ? parseInt(formData.beam) : undefined,
      draft: formData.draft ? parseInt(formData.draft) : undefined,
      serviceSpeed: parseInt(formData.serviceSpeed),
      fuelType: formData.fuelType,
      fuelConsumptionRate: formData.fuelConsumptionRate ? parseInt(formData.fuelConsumptionRate) : undefined,
      enginePower: formData.enginePower ? parseInt(formData.enginePower) : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gemiler</h1>
            <p className="text-gray-600">Gemi filonuzu yönetin</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Yeni Gemi Ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Yeni Gemi Ekle</DialogTitle>
                <DialogDescription>
                  Gemi bilgilerini girin. Zorunlu alanlar işaretlenmiştir.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Gemi Adı *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vesselType">Gemi Tipi *</Label>
                      <Select
                        value={formData.vesselType}
                        onValueChange={(v) => setFormData({ ...formData, vesselType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Container">Container</SelectItem>
                          <SelectItem value="Tanker">Tanker</SelectItem>
                          <SelectItem value="Bulk Carrier">Bulk Carrier</SelectItem>
                          <SelectItem value="General Cargo">General Cargo</SelectItem>
                          <SelectItem value="RoRo">RoRo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dwt">DWT (ton) *</Label>
                      <Input
                        id="dwt"
                        type="number"
                        value={formData.dwt}
                        onChange={(e) => setFormData({ ...formData, dwt: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="serviceSpeed">Servis Hızı (knot) *</Label>
                      <Input
                        id="serviceSpeed"
                        type="number"
                        value={formData.serviceSpeed}
                        onChange={(e) => setFormData({ ...formData, serviceSpeed: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="length">Uzunluk (m)</Label>
                      <Input
                        id="length"
                        type="number"
                        value={formData.length}
                        onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beam">Genişlik (m)</Label>
                      <Input
                        id="beam"
                        type="number"
                        value={formData.beam}
                        onChange={(e) => setFormData({ ...formData, beam: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="draft">Su Çekimi (m)</Label>
                      <Input
                        id="draft"
                        type="number"
                        value={formData.draft}
                        onChange={(e) => setFormData({ ...formData, draft: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fuelType">Yakıt Tipi *</Label>
                      <Select
                        value={formData.fuelType}
                        onValueChange={(v: any) => setFormData({ ...formData, fuelType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HFO">HFO (Heavy Fuel Oil)</SelectItem>
                          <SelectItem value="LFO">LFO (Light Fuel Oil)</SelectItem>
                          <SelectItem value="MGO">MGO (Marine Gas Oil)</SelectItem>
                          <SelectItem value="MDO">MDO (Marine Diesel Oil)</SelectItem>
                          <SelectItem value="LNG">LNG</SelectItem>
                          <SelectItem value="Methanol">Methanol</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fuelConsumptionRate">Yakıt Tüketimi (ton/gün)</Label>
                      <Input
                        id="fuelConsumptionRate"
                        type="number"
                        value={formData.fuelConsumptionRate}
                        onChange={(e) => setFormData({ ...formData, fuelConsumptionRate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="enginePower">Motor Gücü (kW)</Label>
                    <Input
                      id="enginePower"
                      type="number"
                      value={formData.enginePower}
                      onChange={(e) => setFormData({ ...formData, enginePower: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Ekleniyor..." : "Gemi Ekle"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-12">Yükleniyor...</div>
          ) : vessels && vessels.length > 0 ? (
            vessels.map((vessel) => (
              <Card key={vessel.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Ship className="w-5 h-5 text-blue-600" />
                      <CardTitle>{vessel.name}</CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: vessel.id })}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                  <CardDescription>{vessel.vesselType}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">DWT:</span>
                      <span className="font-medium">{vessel.dwt.toLocaleString()} ton</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Servis Hızı:</span>
                      <span className="font-medium">{vessel.serviceSpeed} knot</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Yakıt Tipi:</span>
                      <span className="font-medium">{vessel.fuelType}</span>
                    </div>
                    {vessel.fuelConsumptionRate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Yakıt Tüketimi:</span>
                        <span className="font-medium">{vessel.fuelConsumptionRate} ton/gün</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <Ship className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Henüz gemi eklenmemiş</p>
              <p className="text-sm text-gray-400 mt-2">Başlamak için yeni bir gemi ekleyin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
