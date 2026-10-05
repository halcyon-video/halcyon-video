"""Customer six uses the approved new clothed body and his original identity.
Run build-cast.py, finalize-cast.py and render-customer-atlas.py for reproduction.
"""
import runpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def apply(body,arm,folder):
 if not (folder/'source-wardrobe.glb').exists():raise RuntimeError('Customer six needs the replacement clothed source; do not recreate the rejected tube body')
 head=runpy.run_path(str(ROOT/'tools/models/customer-six-head.py'))['apply'](body,arm,folder)
 report={'version':4,'collar':False,'construction':'Meshy 7.1 clothed body from the corrected original reference; modeled V-neck leather waistcoat, short cotton sleeves, sewn trousers, low harness boots; original head mesh grafted without modifying its vertex positions, UVs or skin weights','bodyVertices':len(body.data.vertices),'bodyTriangles':sum(len(p.vertices)-2 for p in body.data.polygons),'identity':'Exact original head and fitted stubble, not the generated donor head'}
 (folder/'wardrobe-check.json').write_text(json.dumps(report,indent=2)+'\n')
