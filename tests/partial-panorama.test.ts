import test from 'node:test';
import assert from 'node:assert/strict';
import {partialPanoramaGeometry} from '../src/partial-panorama.ts';

test('a wide photograph occupies a half-circle with cylindrical proportions',()=>{
 const geometry=partialPanoramaGeometry(100,3.18);
 assert.equal(geometry.parameters.thetaLength,Math.PI);
 assert.equal(geometry.parameters.height,100*Math.PI/3.18*4);
 assert.equal(geometry.parameters.openEnded,true);
 assert.equal(geometry.parameters.radiusTop,geometry.parameters.radiusBottom);
 geometry.computeBoundingBox();
 assert(geometry.boundingBox!.min.x>=-1e-6);
 assert(geometry.boundingBox!.max.z>99);
 assert(geometry.boundingBox!.min.z < -99);
 geometry.dispose();
});
