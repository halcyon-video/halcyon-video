import test from 'node:test';
import assert from 'node:assert/strict';
import { frontSoffitPolygon, soffitLampCenters, soffitKeyCenters, soffitTrofferCenters, pointInSoffit } from '../src/ceiling-soffit.ts';
test('recessed and fluorescent soffits share the fitting positions used by their light sources',()=>{
  const spec={counterShape:'shield',doorWidth:3.2,entryStyle:'vestibule'} as any;
  const poly=frontSoffitPolygon(spec,64,.35,.2);
  const cans=soffitLampCenters(poly,.2,true);
  assert.ok(cans.length>=3 && cans.length<=5);
  for(const can of cans)assert.ok(pointInSoffit(can.x,can.z,poly));
  assert.notDeepEqual(cans,soffitTrofferCenters());
  const keys=soffitKeyCenters(poly,.2,true);
  assert.equal(keys.length,2,'no new aggregate lights or shadow passes');
  for(const key of keys)assert.ok(cans.some(c=>c.x===key.x&&c.z===key.z),'every key starts at a real can');
  assert.deepEqual(soffitLampCenters(poly,.2,false),soffitTrofferCenters());
  assert.deepEqual(soffitLampCenters([],.2,true),[]);
  for(const width of [40,48,64,80]) {
    const pair=soffitKeyCenters(frontSoffitPolygon(spec,width,.35,.2),.2,true);
    assert.equal(pair.length,2);
    assert.notDeepEqual(pair[0],pair[1],'small soffits never stack two keys at one fitting');
  }
});
