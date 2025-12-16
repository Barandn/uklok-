#!/bin/bash

# ========================================
# Green Shipping API Test Script
# Veritabanı olmadan anlık hesaplama testi
# ========================================

BASE_URL="http://localhost:3000/api/trpc"

echo "======================================"
echo "  Green Shipping API Test Suite"
echo "  Anlık Hesaplama Modu"
echo "======================================"
echo ""

# Renk kodları
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test sayacı
PASSED=0
FAILED=0

test_endpoint() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"

    echo -n "Testing: $name... "

    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST "$url" -H "Content-Type: application/json" -d "$data" 2>&1)
    else
        response=$(curl -s "$url" 2>&1)
    fi

    if echo "$response" | grep -q '"result"'; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  Response: ${response:0:100}..."
        ((FAILED++))
        return 1
    fi
}

echo "1. PORT TESTLERI"
echo "----------------"
test_endpoint "Ports List" "$BASE_URL/ports.list?input=%7B%7D"
test_endpoint "Ports Search (Istanbul)" "$BASE_URL/ports.search?input=%7B%22query%22%3A%22istanbul%22%7D"
echo ""

echo "2. VESSEL TESTLERI"
echo "------------------"
test_endpoint "Vessels List" "$BASE_URL/vessels.list"
test_endpoint "Vessel GetById (1)" "$BASE_URL/vessels.getById?input=%7B%22id%22%3A1%7D"
echo ""

echo "3. AUTH TESTLERI"
echo "----------------"
test_endpoint "Auth Me (Guest)" "$BASE_URL/auth.me"
echo ""

echo "4. OPTIMIZATION TESTLERI (Anlık Hesaplama)"
echo "-------------------------------------------"
echo -e "${YELLOW}Not: Bu testler gerçek rota hesaplaması yapar, biraz zaman alabilir${NC}"
echo ""

# Simple Route Test (Great Circle)
echo -n "Testing: Simple Route (Istanbul -> Naples)... "
simple_result=$(curl -s -X POST "$BASE_URL/optimization.runSimple" \
    -H "Content-Type: application/json" \
    -d '{"json":{"startLat":41.0082,"startLon":28.9784,"endLat":40.8518,"endLon":14.2681}}' 2>&1)

if echo "$simple_result" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ PASSED${NC}"

    # Sonuçları göster
    distance=$(echo "$simple_result" | grep -o '"totalDistance":[0-9.]*' | cut -d':' -f2)
    fuel=$(echo "$simple_result" | grep -o '"totalFuel":[0-9.]*' | cut -d':' -f2)
    co2=$(echo "$simple_result" | grep -o '"totalCO2":[0-9.]*' | cut -d':' -f2)
    duration=$(echo "$simple_result" | grep -o '"totalDuration":[0-9.]*' | cut -d':' -f2)

    echo "  ├─ Distance: ${distance:-N/A} nm"
    echo "  ├─ Fuel: ${fuel:-N/A} tons"
    echo "  ├─ CO2: ${co2:-N/A} tons"
    echo "  └─ Duration: ${duration:-N/A} hours"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi
echo ""

echo "5. ROUTES TESTLERI (Boş döner - DB yok)"
echo "----------------------------------------"
test_endpoint "Routes List (Empty)" "$BASE_URL/routes.list"
echo ""

echo "======================================"
echo "  TEST SONUÇLARI"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Tüm testler başarılı!${NC}"
    echo "Proje veritabanı olmadan çalışıyor."
else
    echo -e "${RED}✗ Bazı testler başarısız.${NC}"
fi

echo ""
echo "======================================"
echo "  MANUEL TEST İÇİN"
echo "======================================"
echo "Tarayıcıda aç: http://localhost:3000"
echo ""
echo "API Endpoints:"
echo "  - GET  /api/trpc/ports.list"
echo "  - GET  /api/trpc/vessels.list"
echo "  - POST /api/trpc/optimization.runSimple"
echo "  - POST /api/trpc/optimization.runGenetic"
echo "  - POST /api/trpc/optimization.runAStar"
echo "  - POST /api/trpc/optimization.compare"
