import { isPointOnLand } from './coastline';
import { checkDepth } from './weather';

const points = [
  { name: 'İstanbul', lat: 41.0082, lon: 28.9784 },
  { name: 'Napoli', lat: 40.8518, lon: 14.2681 },
  { name: 'Ege Denizi', lat: 38.0, lon: 25.0 },
  { name: 'Akdeniz', lat: 36.0, lon: 20.0 },
];

console.log('🗺️  Nokta Testleri');
console.log('==================\n');

for (const point of points) {
  const onLand001 = isPointOnLand(point.lat, point.lon, 0.01);
  const onLand01 = isPointOnLand(point.lat, point.lon, 0.1);
  const onLand05 = isPointOnLand(point.lat, point.lon, 0.5);
  const depth = checkDepth(point.lat, point.lon);
  
  console.log(`📍 ${point.name} (${point.lat}, ${point.lon})`);
  console.log(`   Kara (0.01° buffer): ${onLand001 ? '❌ KARA' : '✅ DENİZ'}`);
  console.log(`   Kara (0.1° buffer):  ${onLand01 ? '❌ KARA' : '✅ DENİZ'}`);
  console.log(`   Kara (0.5° buffer):  ${onLand05 ? '❌ KARA' : '✅ DENİZ'}`);
  console.log(`   Derinlik: ${depth}m\n`);
}

process.exit(0);
