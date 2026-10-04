"""Blender regression gates for the authored clerk motion candidate.
Run after video-clerk-motion.py; checks every baked frame, not selected poses.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tools/models/video-clerk-motion.blend'))
a=bpy.data.objects['Armature'];body=bpy.data.objects['Clerk A with polo'];ox=bpy.data.objects['Clerk A with Oxford'];pocket=bpy.data.objects['Oxford chest pocket'];case=bpy.data.objects['Clerk rental case'];shelf=bpy.data.objects['Review shelf'];sc=bpy.context.scene
out=ROOT/'scratch/clerk-motion';out.mkdir(parents=True,exist_ok=True)
ox.data.calc_loop_triangles()
torso=[list(t.vertices) for t in ox.data.loop_triangles if all(abs(ox.data.vertices[i].co.x)<14 and 84<ox.data.vertices[i].co.z<108 for i in t.vertices)]
report={};failures=[]
def require(condition,message):
 if not condition:failures.append(message)
def direction(name):
 b=a.pose.bones[name];return (b.tail-b.head).normalized()
for anim,seconds in [('idle',3.2),('walk',1.3),('stockHigh',4.4),('stockMid',4.2),('stockLow',4.8),('talk',3.2),('type',2.4)]:
 for o in bpy.data.objects:
  if o.animation_data:
   o.animation_data.action=None
   for tr in o.animation_data.nla_tracks:tr.mute=tr.name!=anim
 count=round(seconds*30);rows=[];ends=[]
 for frame in range(count+1):
  sc.frame_set(frame);u=frame/count;deps=bpy.context.evaluated_depsgraph_get();row={'frame':frame}
  mesh=ox.evaluated_get(deps).data
  bvh=BVHTree.FromPolygons([v.co for v in mesh.vertices],torso,all_triangles=True)
  clearance=[]
  for v in pocket.evaluated_get(deps).data.vertices:
   loc,n,_,_=bvh.find_nearest(v.co);clearance.append((v.co-loc).dot(n))
  row['pocketClearanceCm']=min(clearance)
  require(min(clearance)>.02,f'{anim} frame {frame}: pocket penetrates shirt')
  if anim=='walk':
   row['spinePitchDegrees']=[math.degrees(math.atan2(-direction(n).y,direction(n).z)) for n in ['Hips','Spine02','Spine01','Spine','neck']]
   row['kneeDegrees']=[math.degrees(direction(s+'UpLeg').angle(direction(s+'Leg'))) for s in ['Left','Right']]
   row['jointLocalTranslationCm']=max(b.location.length for b in a.pose.bones)
   row['shoulderDepthCm']=max(abs(a.pose.bones[s+'Arm'].head.y-a.pose.bones['Spine'].head.y) for s in ['Left','Right'])
   require(all(abs(v)<5 for v in row['spinePitchDegrees']),f'walk frame {frame}: opposing spine bends')
   require(max(row['kneeDegrees'])<39,f'walk frame {frame}: excessive knee flexion')
   require(row['jointLocalTranslationCm']<.01,f'walk frame {frame}: disconnected bone translation')
   require(row['shoulderDepthCm']<1.5,f'walk frame {frame}: pulled-back shoulder')
   # Judge the visible shirt/shoe surfaces, not just bone orientation. The
   # previous upright-spine gate allowed the whole stride behind the chest.
   row['surfaceFootfalls']={}
   for obj in [body,ox]:
    ev=obj.evaluated_get(deps);vs=ev.data.vertices
    chest=min(vs[v.index].co.y for v in obj.data.vertices if abs(v.co.x)<15 and 93<v.co.z<112)
    shoes={side:[vs[v.index].co for v in obj.data.vertices if v.co.z<9 and (v.co.x>0)==(side=='Left')] for side in ['Left','Right']}
    values={side:{'heelAheadCm':chest-max(v.y for v in ps),'soleHeightCm':min((ev.matrix_world@v).z for v in ps)/a.matrix_world.to_scale().z} for side,ps in shoes.items()}
    row['surfaceFootfalls'][obj.name]=values
    if frame in [0,count] or abs(u-.5)<.014:
     side='Left' if frame in [0,count] else 'Right';v=values[side]
     require(v['heelAheadCm']>.5,f'walk frame {frame}: {obj.name} {side} heel behind chest {v}')
     require(abs(v['soleHeightCm'])<1.5,f'walk frame {frame}: {obj.name} {side} forward foot airborne {v}')

  if anim.startswith('stock'):
   row['wristDegrees']=[math.degrees(direction(s+'Hand').angle(direction(s+'ForeArm'))) for s in ['Left','Right']]
   row['fingerElevationDegrees']=[math.degrees(math.asin(direction(s+'Hand').z)) for s in ['Left','Right']]
   require(max(row['wristDegrees'])<1,f'{anim} frame {frame}: bent stocking wrist')
   require(max(abs(v) for v in row['fingerElevationDegrees'])<55,f'{anim} frame {frame}: vertical stocking hand')
   if u<=.44 or u>=.78:
    row['palmContactErrorCm']=[(a.pose.bones[s+'Hand'].head+direction(s+'Hand')*8.8-(case.location+Vector((sign*9.1,1,0)))).length for s,sign in [('Left',1),('Right',-1)]]
    require(max(row['palmContactErrorCm'])<.05,f'{anim} frame {frame}: missed grip')
   if .33<=u<=.78:
    gap=(case.matrix_world.translation.z-shelf.matrix_world.translation.z)/a.matrix_world.to_scale().z-10
    require(abs(gap-.2)<.05,f'{anim} frame {frame}: unseated case')
  if frame in [0,count]:ends.append({b.name:b.matrix.copy() for b in a.pose.bones})
  rows.append(row)
 drift=max(max(abs(ends[0][n][i][j]-ends[1][n][i][j]) for i in range(4) for j in range(4)) for n in ends[0])
 require(drift<.01,f'{anim}: loop seam {drift}')
 report[anim]={'frames':len(rows),'loopMatrixDrift':drift,'minPocketClearanceCm':min(r['pocketClearanceCm'] for r in rows),'rows':rows}
 print('CHECKED',anim,len(rows),'frames; pocket',report[anim]['minPocketClearanceCm'],'loop',drift,flush=True)
(out/'pose-audit.json').write_text(json.dumps({'clips':report,'failures':failures},indent=2))
assert not failures,'\n'.join(failures[:30])
print('PASS connected walking spine, reduced knees, neutral stocking wrists, grips, shelf contact, pocket clearance and loop seams.',flush=True)
