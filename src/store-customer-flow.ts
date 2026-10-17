import type { StoreScene } from './three-scene';
import { StoreCustomers } from './store-customers';
import { CustomerParking, customerStoreYear } from './customer-parking';
import { CustomerSimulation, type CustomerStop } from './customer-simulation';
import { customerStops } from './customer-stops';
import { CustomerVehicles } from './customer-vehicles';
import { customerCount } from './cast-catalog';

export function installStoreCustomers(scene: StoreScene): void {
  // Pin 265: shoppers path on the clerk's plan with her counter gap shut.
  const gate=scene.entrance?.getClerkNav()?.gate??[];
  const nav=gate.length?scene.clerkNavGrid?.extended(gate):scene.clerkNavGrid, exterior=scene.exterior, frame=scene.entrance?.getCounterFrame();
  if(!nav||!exterior||!frame||!customerCount(scene.getOutsideMode()))return;
  const checkoutPoint=nav.nearestWalkable(frame.fx-frame.nx*2.3,frame.fz-frame.nz*2.3,1);
  // The shared clerk grid excludes the vestibule. Its store-side door approach
  // is the admission/departure boundary, never a path through its glass walls.
  // The cell nearest the lot can lie in the counter well behind the vestibule;
  // then the side door that opens onto the sales floor is the shoppers' door.
  const vest=scene.entrance?.getVestibuleInfo();
  const doors=[[exterior.parking.centerX,exterior.parking.frontZ-5],...(vest?[[vest.xL-1.5,vest.sideDoorZ],[vest.xR+1.5,vest.sideDoorZ]]:[])];
  const exitPoint=checkoutPoint&&doors.map(([x,z])=>nav.nearestWalkable(x,z,4))
    .find(p=>p&&nav.findPath(p.x,p.z,checkoutPoint.x,checkoutPoint.z));
  if(!checkoutPoint||!exitPoint)return;
  const checkout:CustomerStop={...checkoutPoint,id:'checkout',yaw:Math.atan2(frame.nx,frame.nz),departments:[]};
  const exit:CustomerStop={...exitPoint,id:'exit',yaw:0,departments:[]};
  const stops=customerStops(scene.plan,scene.libraries,scene.slottedFixtures,nav,exit,checkout);
  if(!stops.length)return;
  const parking=new CustomerParking(exterior.parking.spaces,customerStoreYear(scene.activeTheme.id),exterior.parking.stallWidth,exterior.parking.stallDepth);
  const simulation=new CustomerSimulation(nav,stops,parking,checkout,exit);
  const vehicles=new CustomerVehicles(parking,()=>{scene.queueStructuralShadowRefresh();scene.requestRender();});
  exterior.group.add(vehicles.group);
  scene.customers=new StoreCustomers(simulation,vehicles,()=>scene.requestRender(),scene.getOutsideMode());
  scene.scene.add(scene.customers.group);
}

export function refreshStoreCustomers(scene: StoreScene): void {
  if (!scene.customers) return;
  scene.customers.dispose();
  scene.customers = null;
  installStoreCustomers(scene);
  scene.queueStructuralShadowRefresh();
}
