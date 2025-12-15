/**
 * Simple Bathymetry API Test
 * Direct test of ERDDAP API without dependencies
 */

import axios from 'axios';

const ERDDAP_BASE = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s';

async function testERDDAPAPI() {
  console.log('🌊 Testing NOAA ERDDAP ETOPO 2022 API\n');
  console.log('=' .repeat(60));

  const testPoints = [
    { name: 'Istanbul Bosphorus', lat: 41.0082, lon: 28.9784, expected: 'Shallow (~50m)' },
    { name: 'Marmara Sea', lat: 40.7, lon: 28.0, expected: 'Moderate (~200m)' },
    { name: 'Aegean Sea', lat: 39.0, lon: 25.0, expected: 'Deep (~1000m)' },
    { name: 'Ionian Sea', lat: 38.0, lon: 18.0, expected: 'Very Deep (~3000m)' },
    { name: 'Gulf of Naples', lat: 40.8518, lon: 14.2681, expected: 'Moderate (~500m)' },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const point of testPoints) {
    try {
      const url = `${ERDDAP_BASE}.json?z[(${point.lat})][(${point.lon})]`;

      console.log(`\n📍 ${point.name}`);
      console.log(`   Coordinates: (${point.lat}, ${point.lon})`);
      console.log(`   Expected: ${point.expected}`);
      console.log(`   Querying ERDDAP...`);

      const startTime = Date.now();
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'UklokGreenShipping/1.0' }
      });
      const duration = Date.now() - startTime;

      const rows = response.data?.table?.rows;
      if (!rows || rows.length === 0) {
        console.log(`   ❌ No data returned`);
        failCount++;
        continue;
      }

      const elevation = rows[0][2]; // meters
      const depth = elevation < 0 ? Math.abs(elevation) : 0;

      console.log(`   ✅ Depth: ${depth.toFixed(1)}m`);
      console.log(`   ⏱️  Response time: ${duration}ms`);

      // Vessel draft check (12m draft requires 18m depth)
      const vesselDraft = 12;
      const requiredDepth = vesselDraft * 1.5;
      const adequate = depth >= requiredDepth;

      console.log(`   🚢 12m Draft Vessel: ${adequate ? '✅ SAFE' : '⚠️ TOO SHALLOW'} (need ${requiredDepth}m)`);

      successCount++;

    } catch (error: any) {
      console.log(`   ❌ API Error: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results:`);
  console.log(`   Successful queries: ${successCount}/${testPoints.length}`);
  console.log(`   Failed queries: ${failCount}/${testPoints.length}`);

  if (successCount === testPoints.length) {
    console.log('\n✅ All ERDDAP API tests passed!');
    console.log('   Real bathymetry data is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check network connection or API availability.');
  }
}

testERDDAPAPI().catch(console.error);
