import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitFacadeEntryVertex as fit } from '../src/storefront-entry-fit.ts';
import { facadeDimensions } from '../src/storefront-architecture.ts';
const near = (a: number, b: number) => assert(Math.abs(a-b)<1e-6, `${a} != ${b}`);

test('variable vestibules retain divider, door and sidelight anchors', () => {
  for (const opening of [6.6,7.2,8.2]) for (const sign of [-1,1]) {
    const args = [18,opening+.7,opening,'gabled-brick'] as const;
    near(fit(sign*.9, 4, ...args)[0], sign*.9);
    near(fit(sign*4.1, 4, ...args)[0], sign*(opening-3.1));
    near(fit(sign*7.2, 4, ...args)[0], sign*opening);
    near(fit(sign*7.2, 9.15, ...args)[1], 9.15);
  }
});
test('gable roof fits the sign envelope with straight slopes and constant pier width', () => {
  for (const half of [7.3,7.9,8.9]) for (const ceiling of [13.5,18,24]) {
    const d=facadeDimensions(ceiling,half,'gabled-brick');
    for (const t of [0,.25,.5,.75,1]) {
      const [x,y]=fit(6.6*t,17.1+6.003*(1-t),ceiling,half,half-.7,'gabled-brick');
      near(x,(d.massHalf-1)*t);
      near(y,d.gableBase+d.gableHeight*(1-t));
    }
    const left=fit(7.6,17.9,ceiling,half,half-.7,'gabled-brick');
    const right=fit(10.35,17.9,ceiling,half,half-.7,'gabled-brick');
    near(right[0]-left[0],2.75);
  }
});

test('cone supports stay circular across room widths and ceiling heights', () => {
  for (const half of [7.3,7.9,8.9]) for (const ceiling of [13.5,18,24]) {
    const d=facadeDimensions(ceiling,half,'cone-canopy');
    near(fit(9.5-1.45,9.15,ceiling,half,5.55,'cone-canopy')[0],half+1.6-1.45);
    near(fit(9.5+1.45,9.15,ceiling,half,5.55,'cone-canopy')[0],half+1.6+1.45);
    near(fit(9.5,.42,ceiling,half,5.55,'cone-canopy')[1],.42);
    near(fit(0,18.2,ceiling,half,5.55,'cone-canopy')[1],d.pierTop);
    near(fit(5.55,0,ceiling,half,6.2,'cone-canopy')[0],6.2);
  }
});
