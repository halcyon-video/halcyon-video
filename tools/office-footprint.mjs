// Measured plan diagram from the live scene's navigation and model bounds.
import { writeFileSync } from 'node:fs';
export async function writeOfficeFootprint(metrics, out, browser) {
  const X = x => 90 + (x - 1) * 38;
  const Y = z => 65 + (10 - z) * 38;
  const polygons = metrics.nav.footprints.map(f => {
    const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const points = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => {
      const x=a*f.w/2,z=b*f.d/2;
      return `${X(f.cx+x*c+z*s)},${Y(f.cz-x*s+z*c)}`;
    }).join(' ');
    return `<polygon points="${points}" fill="#d9dfe5" stroke="#64748b" stroke-width="1.5"/>`;
  }).join('');
  const rectangle = (bounds, color, opacity=1) => `<rect x="${X(bounds.min[0])}" y="${Y(bounds.max[2])}" width="${(bounds.max[0]-bounds.min[0])*38}" height="${(bounds.max[2]-bounds.min[2])*38}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-width="2"/>`;
  const terminals=metrics.adjoining.filter(o=>o.present && o.name.startsWith('counter-terminal')).map(o=>rectangle(o.bounds,'#2563eb',.2)).join('');
  const anchors=[metrics.nav.register,...metrics.nav.terminals].map(p=>`<circle cx="${X(p.x)}" cy="${Y(p.z)}" r="5" fill="#7c3aed"/>`).join('');
  const grid=[];
  for(let x=2;x<=20;x+=2)grid.push(`<path d="M${X(x)},65 V692" stroke="#edf0f4"/><text x="${X(x)}" y="712" text-anchor="middle">${x}</text>`);
  for(let z=-6;z<=10;z+=2)grid.push(`<path d="M90,${Y(z)} H888" stroke="#edf0f4"/><text x="77" y="${Y(z)+5}" text-anchor="end">${z}</text>`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="820" viewBox="0 0 1000 820">
  <rect width="1000" height="820" fill="white"/>
  <style>text{font-family:Arial,sans-serif;font-size:14px;fill:#233044}</style>
  <text x="90" y="32" style="font-size:24px;font-weight:bold">Office kit: measured counter footprint</text>
  <defs><clipPath id="plot"><rect x="90" y="65" width="798" height="627"/></clipPath></defs>
  ${grid.join('')}<g clip-path="url(#plot)">${polygons}${terminals}${rectangle(metrics.bounds,'#d97706',.85)}${anchors}</g>
  <text x="490" y="742" text-anchor="middle">World X (feet)</text><text x="25" y="400" transform="rotate(-90 25 400)">World Z (feet)</text>
  <text x="${X(12.6)}" y="${Y(9.15)}" text-anchor="middle">Office kit: 3.47 × 1.20 ft</text>
  <path d="M${X(12.6)},${Y(9)} L${X(12.6)},${Y(8.4)}" stroke="#d97706" stroke-width="2"/>
  <text x="${X(11)}" y="${Y(4.3)}" text-anchor="middle">Open staff work strip</text>
  <text x="90" y="776">Gray: existing obstacles • Blue: loaded terminals • Purple: clerk standing anchors</text>
  <text x="90" y="803">Kit stays inside the rear counter obstacle. No added floor footprint; terminal and signage bounds are clear.</text>
  </svg>`;
  writeFileSync(out+'/footprint-plan.svg',svg);
  const page=await browser.newPage();
  await page.setViewport({width:1000,height:820});await page.setContent(svg);
  await page.screenshot({path:out+'/footprint-plan.png'});await page.close();
}
