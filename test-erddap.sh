#!/bin/bash

echo "🌊 Testing NOAA ERDDAP ETOPO 2022 Bathymetry API"
echo "================================================"
echo ""

test_point() {
    local name="$1"
    local lat="$2"
    local lon="$3"
    local draft="$4"

    echo "📍 $name"
    echo "   Coordinates: ($lat, $lon)"

    # URL encode the brackets
    local url="https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.json?z%5B($lat)%5D%5B($lon)%5D"

    # Get the data
    local response=$(curl -s "$url")

    if [ $? -eq 0 ]; then
        # Extract elevation using python
        local elevation=$(echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['table']['rows'][0][2])" 2>/dev/null)

        if [ -n "$elevation" ]; then
            # Calculate depth (negative elevation = depth)
            local depth=$(python3 -c "print(abs($elevation))")

            echo "   Elevation: $elevation m"
            echo "   Depth: $depth m"

            # Check if adequate for vessel draft
            local required=$(python3 -c "print($draft * 1.5)")
            local adequate=$(python3 -c "print('SAFE' if $depth >= $required else 'SHALLOW')")

            if [ "$adequate" = "SAFE" ]; then
                echo "   ✅ $adequate for ${draft}m draft vessel (need ${required}m)"
            else
                echo "   ⚠️  $adequate for ${draft}m draft vessel (need ${required}m)"
            fi
        else
            echo "   ❌ Failed to parse response"
        fi
    else
        echo "   ❌ API request failed"
    fi

    echo ""
}

# Test points along Istanbul-Naples route
test_point "Istanbul Bosphorus" "41.0082" "28.9784" "12"
test_point "Marmara Sea" "40.7" "28.0" "12"
test_point "Aegean Sea" "39.0" "25.0" "12"
test_point "Ionian Sea" "38.0" "18.0" "12"
test_point "Gulf of Naples" "40.852" "14.268" "12"

echo "✅ API test completed!"
