"""Retarget licensed ACCAD captures using a calibrated standing pose.
Source decoding uses Three.js BVHLoader; this module adapts world rotations while
preserving the destination skeleton's connected joint translations and lengths.
"""
import json, math
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
SOURCES={
 'idle':('Female1_A01_Stand',0,90),
 'walk':('Female1_B02_WalkToStand',29,69),
 'walkCompact':('Female1_B02_WalkToStandT2',7,47),
 'walkSteady':('Female1_B03_Walk1',80,118),
}
MAP={'Hips':'Hips','Spine02':'Spine','Spine01':'Spine1','Spine':'Spine1','neck':'Neck','Head':'Head'}
for side in ['Left','Right']:
 for part in ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase']:MAP[side+part]=side+part

def load(root):
 captures={}
 for name,(file,start,end) in SOURCES.items():
  data=json.loads((root/'tools/models/motion-sources'/(file+'.json')).read_text());frames=data['samples'];fps=data['fps']
  if name=='idle':
   lateral=sum((Vector(f['LeftUpLeg']['p'])-Vector(f['RightUpLeg']['p']) for f in frames),Vector());lateral.y=0;lateral.normalize();forward=lateral.cross(Vector((0,1,0))).normalized()
  else:
   forward=Vector(frames[end]['Hips']['p'])-Vector(frames[start]['Hips']['p']);forward.y=0;forward.normalize();lateral=Vector((0,1,0)).cross(forward)
  # Source Y-up/+Z-forward -> destination Z-up/-Y-forward.
  transform=Matrix((lateral,-forward,Vector((0,1,0))));rotation=transform.to_quaternion()
  samples=[]
  for f in frames[start:end+1]:
   q={n:rotation@Quaternion((v['q'][3],*v['q'][:3])) for n,v in f.items()}
   samples.append({'q':q,'hip':transform@Vector(f['Hips']['p'])})
  captures[name]={'samples':samples,'duration':(end-start)/30,'sourceFrames':[start,end],'source':file,'fps':fps}
 return captures

def calibrate_hands(arm,update):
 """Measure the actual palm plane, then distribute neutral roll over the wrist.
 Generated hand bone rolls do not describe the mesh's palm orientation. Use
 weighted skin geometry (including authored digits) rather than a fixed roll.
 """
 import numpy as np
 body=max((o for o in arm.children if o.type=='MESH' and o.vertex_groups),key=lambda o:len(o.data.vertices))
 report={}
 for side,sign in [('Left',1),('Right',-1)]:
  rest=arm.data.bones[side+'Hand'];names={rest.name,*[b.name for b in rest.children_recursive]}
  groups={g.index for g in body.vertex_groups if g.name in names}
  points=np.array([tuple(v.co) for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.65])
  if len(points)<12:raise RuntimeError('Insufficient hand skin for '+side)
  values,vectors=np.linalg.eigh(np.cov(points.T));normal=Vector(vectors[:,0])
  # Meshy bases face -Y; choose the palm side nearest the anatomical medial
  # direction. Front-facing open palms use the same sign on both hands.
  if normal.dot(Vector((-sign,-.25,0)))<0:normal=-normal
  local=rest.matrix_local.to_3x3().inverted()@normal
  hand=arm.pose.bones[rest.name];axis=(hand.tail-hand.head).normalized()
  actual=hand.matrix.to_3x3()@local;actual=(actual-axis*actual.dot(axis)).normalized()
  desired=Vector((-sign,-.12,0));desired=(desired-axis*desired.dot(axis)).normalized()
  angle=math.atan2(axis.dot(actual.cross(desired)),actual.dot(desired))
  fore=arm.pose.bones[side+'ForeArm'];m=fore.matrix.copy();q=Quaternion((fore.tail-fore.head).normalized(),angle*.65)
  fore.matrix=Matrix.Translation(m.translation)@q.to_matrix().to_4x4()@m.to_3x3().to_4x4();update()
  hand=arm.pose.bones[rest.name];m=hand.matrix.copy();q=Quaternion((hand.tail-hand.head).normalized(),angle*.35)
  hand.matrix=Matrix.Translation(m.translation)@q.to_matrix().to_4x4()@m.to_3x3().to_4x4();update()
  report[side]={'neutralRollDegrees':math.degrees(angle),'palmNormalLocal':list(local),'planeEigenvalues':list(values)}
 arm['hand_calibration']=json.dumps(report)
 return report

def make_retarget(arm,reset,aim,hand_curl,update,root):
 captures=load(root)
 reset()
 # Calibrate the actual character to a neutral upright stance, independently of
 # its generated A-pose. No step distances or joint oscillators are authored.
 aim('Hips',(0,.08,1))
 for n in ['Spine02','Spine01','Spine']:aim(n,(0,.16,1))
 aim('neck',(0,0,1))
 head=arm.pose.bones['Head'];head.matrix=Matrix.Translation(head.head)@arm.data.bones['Head'].matrix_local.to_3x3().to_4x4();update()
 for side,sign in [('Left',1),('Right',-1)]:
  aim(side+'Arm',(sign*.24,.025,-1));aim(side+'ForeArm',(sign*.045,-.10,-1));aim(side+'Hand',(sign*.045,-.10,-1))
  aim(side+'UpLeg',(sign*.015,0,-1));aim(side+'Leg',(sign*.015,0,-1));hand_curl(side,.20)
  # Feet keep their authored shoe orientation; captured rotations supply roll
  # and toe-off relative to the source's standing calibration.
  b=arm.pose.bones[side+'Foot'];b.matrix=Matrix.Translation(b.head)@arm.data.bones[b.name].matrix_local.to_3x3().to_4x4();update()
  arm.pose.bones[side+'ToeBase'].matrix_basis=Matrix.Identity(4);update()
 calibrate_hands(arm,update)
 base={b.name:b.matrix.to_quaternion().copy() for b in arm.pose.bones}
 calibration=captures['idle']['samples'][0]['q']
 def apply(name,u):
  reset();clip=captures[name];samples=clip['samples'];t=u*(len(samples)-1);i=min(int(t),len(samples)-2);v=t-i;blend=u*u*(3-2*u)
  for bone in arm.pose.bones:
   if bone.name not in MAP:continue
   src=MAP[bone.name]
   q=samples[i]['q'][src].slerp(samples[i+1]['q'][src],v)
   seam=samples[0]['q'][src]@samples[-1]['q'][src].inverted()
   q=Quaternion().slerp(seam,blend)@q
   delta=q@calibration[src].inverted()
   bone.matrix=Matrix.Translation(bone.head)@(delta@base[bone.name]).to_matrix().to_4x4();update()
  for side in ['Left','Right']:hand_curl(side,.20)
  # The source's horizontal travel is intentionally omitted for sprite loops.
  # Grounding is shared with the existing exporter and uses deformed soles.
 return captures,apply
