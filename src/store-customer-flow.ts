import type { StoreScene } from './three-scene';
import { StoreCustomers } from './store-customers';
import { CustomerParking, customerStoreYear } from './customer-parking';
import { CustomerSimulation, type CustomerStop } from './customer-simulation';
import { customerStops } from './customer-stops';
import { CustomerVehicles } from './customer-vehicles';
import { customerCount } from './cast-catalog';

export function installStoreCustomers(scene: StoreScene): void {
  const nav=scene.clerkNavGrid, exterior=scene.exterior, frame=scene.entrance?.getCounterFrame();
  if(!nav||!exterior||!frame||!customerCount(localStorage.getItem('bb_customers')))return;
  const checkoutPoint=nav.nearestWalkable(frame.fx-frame.nx*2.3,frame.fz-frame.nz*2.3,1);
  // The shared clerk grid excludes the vestibule. Its store-side door approach
  // is the admission/departure boundary, never a path through its glass walls.
  const exitPoint=nav.nearestWalkable(exterior.parking.centerX,exterior.parking.frontZ-5,4);
  if(!checkoutPoint||!exitPoint||!nav.findPath(exitPoint.x,exitPoint.z,checkoutPoint.x,checkoutPoint.z))return;
  const checkout:CustomerStop={...checkoutPoint,id:'checkout',yaw:Math.atan2(frame.nx,frame.nz),departments:[]};
  const exit:CustomerStop={...exitPoint,id:'exit',yaw:0,departments:[]};
  const stops=customerStops(scene.plan,scene.libraries,scene.slottedFixtures,nav,exit,checkout);
  if(!stops.length)return;
  const parking=new CustomerParking(exterior.parking.spaces,customerStoreYear(scene.activeTheme.id),exterior.parking.stallWidth,exterior.parking.stallDepth);
  const simulation=new CustomerSimulation(nav,stops,parking,checkout,exit);
  const vehicles=new CustomerVehicles(parking,()=>{scene.queueStructuralShadowRefresh();scene.requestRender();});
  exterior.group.add(vehicles.group);
  scene.customers=new StoreCustomers(simulation,vehicles,()=>scene.requestRender());
  scene.scene.add(scene.customers.group);
}
