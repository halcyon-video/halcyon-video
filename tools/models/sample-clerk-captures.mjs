// Decode licensed BVH captures with Three.js, preserving every source sample.
// Run from the repository root before Blender's video-clerk-motion.py.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {BVHLoader} from 'three/addons/loaders/BVHLoader.js';
const directory=fileURLToPath(new URL('./motion-sources/',import.meta.url));
for(const name of ['Female1_A01_Stand','Female1_B02_WalkToStand','Female1_B02_WalkToStandT2','Female1_B03_Walk1']){
 const {skeleton,clip}=new BVHLoader().parse(fs.readFileSync(directory+name+'.bvh','utf8'));
 const root=new THREE.Group();root.add(skeleton.bones[0]);
 const mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip);
 action.setLoop(THREE.LoopOnce);action.clampWhenFinished=true;action.play();
 const times=clip.tracks[0].times,samples=[];
 for(const time of times){
  mixer.setTime(time);root.updateMatrixWorld(true);const frame={};
  for(const bone of skeleton.bones){if(bone.name==='ENDSITE')continue;frame[bone.name]={p:bone.getWorldPosition(new THREE.Vector3()).toArray(),q:bone.getWorldQuaternion(new THREE.Quaternion()).toArray()};}
  samples.push(frame);
 }
 fs.writeFileSync(directory+name+'.json',JSON.stringify({duration:clip.duration,fps:(times.length-1)/clip.duration,samples})+'\n');
 console.log(name,samples.length,'source samples');
}
