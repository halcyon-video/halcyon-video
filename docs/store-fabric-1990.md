# 1990 store fabric

The 1990 edition uses a white painted structural column with the same continuous
primary/secondary/primary bands as the perimeter wall. The wall and column share
the stripe texture and ceiling-relative height. The column builds no Reflector,
mirror cladding or raised mirror-frame trim in this edition.

Checkout and returns use solid primary-color customer-facing laminate. The
upper checkout surround is 0.8 feet tall, with gently eased edges and plan
corners. Lower employee work surfaces remain light, at their existing height.
Collision envelopes, service anchors, staff openings and the returns receiver
retain their existing contracts. Other editions continue to load their existing
models and finishes.

## Editable models

Run the existing Blender authoring scripts with `-- --era-1990`:

- `tools/models/checkout-counter.py` exports the shield and U-square layouts in
  both styles and saves `tools/models/checkout-counter-1990.blend`.
- `tools/models/exit-return-counter.py` exports the matching returns counter,
  editable source and measured geometry receipt, all with the `-1990` suffix.

The unsuffixed exports are unchanged. The 1990 checkout drop-in filenames now
end in `-solid.glb`; the returns drop-in is `counter-1990.glb`. This prevents an
older striped drop-in from replacing the revised silhouette.

The Information marker is a slim, double-sided, rounded rectangular board with
plain gold-role lettering on the dark primary-role field. It uses the bundled
Outfit face and the active palette. It is attached over the customer side of
the counter and removed with the entrance. It is absent from independent-store
formats without counter dressing.

## Verification

The authoring scripts check closed millwork surfaces for manifoldness. The
1990 export tests check material roles, service-surface bounds, floor origin,
finite normals and UVs, and bounded mesh size against the existing exports.
Review in-app photographs from checkout, the returns approach and the column
cross-aisle in addition to the flat sign comparison. Screenshots used publicly
must come from a tree without user assets.
