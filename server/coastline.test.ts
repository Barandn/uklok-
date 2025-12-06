import { describe, it, expect } from 'vitest';
import { isPointOnLand, routeCrossesLand } from './coastline';

describe('Coastline Detection', () => {
  it('should allow open water points', () => {
    // Akdeniz ortası (deniz)
    expect(isPointOnLand(36.0, 20.0, 0.02)).toBe(false);
    
    // Ege Denizi (deniz)
    expect(isPointOnLand(38.0, 25.0, 0.02)).toBe(false);
    
    // Karadeniz ortası (deniz)
    expect(isPointOnLand(43.0, 35.0, 0.02)).toBe(false);
    
    // Adriyatik Denizi
    expect(isPointOnLand(40.0, 18.0, 0.02)).toBe(false);
  });

  it('should detect route crossing land', () => {
    // İtalya üzerinden geçen rota (kara)
    const crossesItaly = routeCrossesLand(45.0, 10.0, 40.0, 15.0, 10);
    console.log('İtalya üzerinden:', crossesItaly);
    expect(crossesItaly).toBe(true);
    
    // Kuzey Afrika üzerinden geçen rota (kara)
    const crossesAfrica = routeCrossesLand(36.0, 10.0, 36.0, 20.0, 10);
    console.log('Kuzey Afrika üzerinden:', crossesAfrica);
    expect(crossesAfrica).toBe(true);
  });

  it('should allow Mediterranean sea routes', () => {
    // Akdeniz açık deniz noktaları - kara olmamalı
    expect(isPointOnLand(35.0, 20.0, 0.01)).toBe(false);
    expect(isPointOnLand(35.0, 25.0, 0.01)).toBe(false);
    expect(isPointOnLand(37.0, 18.0, 0.01)).toBe(false);
    
    // İstanbul-Napoli rotası kontrolü (bilgilendirme amaçlı)
    const istanbulNapoli = routeCrossesLand(41.0082, 28.9784, 40.8518, 14.2681, 20);
    console.log('İstanbul-Napoli kara geçişi tespit edildi mi:', istanbulNapoli);
  });
});
