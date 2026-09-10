# Reference study: ambiguous entrance and counter hardware (#288)

**Audit date:** 2026-09-07 / 2026-09-10  
**Supporting scope:** #151 (Blender model backlog)  
**Status:** Completed reference study — object identities, photographic/video dispositions, and existing coverage resolved. No duplicate or unproven 3D models created.

This reference audit resolves four ambiguous catalog labels for entrance and counter hardware identified during the 2026-09-07 backlog review. Unoccluded frames and extended original-video sequences were retrieved and inspected to determine whether each candidate represents a distinct volumetric 3D object, a 2D printed element, or a variant belonging to an existing fixture family.

---

## 1. Mullion brochure pocket

### Reference evidence
- [Video Ehu5CKAoHV4, f0149 (about 296 seconds)](https://youtu.be/Ehu5CKAoHV4?t=296)
- [Video Ehu5CKAoHV4, f0150 (about 298 seconds)](https://youtu.be/Ehu5CKAoHV4?t=298)
- Additional sequence: 294.5s – 299.0s (customer entrance tracking shot past the perimeter security mullion).

### Ambiguity addressed
An older catalog label termed this purple/blue-and-white object on the vertical door jamb a "brochure pocket" or "brochure holder". Native frames established a mounted rectangular shape but did not resolve whether the object possessed volumetric pocket depth (a hopper cavity holding folded paper brochures) or was simply a flat surface notice. Issue #234 exclusively covers counter tents, leaving an evidence gap.

### Confirmation & findings
- **Pocket opening & depth:** **Negative.** The object has **no pocket cavity, no open top lip, and no volumetric depth**.
- **Evidence:** In the continuous entrance sequence at 294.5s–298.5s (f0150), a customer in a red coat enters the vestibule and walks through the door frame past the dark bronze anodized aluminum mullion. Seen from an oblique ~45° profile and passing side angle, the rectangle lies completely flush against the mullion face (< 3–5 mm / under 0.25 inches thick). A functional brochure dispenser holding multi-fold paper brochures would require 2.5–4 inches (65–100 mm) of forward volumetric projection; no such projection, sidewalls, or mouth are present.
- **Physical identity:** The object is a **flat printed store notice placard / adhesive decal** featuring a purple/blue border and white informational panel (hours, safety, or store policy), affixed directly to the interior face of the entrance door frame mullion at eye level (~5.0–5.3 ft off the finished floor).

### Disposition & coverage
- **Disposition:** **Proven printed-only (flat signage).**
- **3D Modeling action:** **Reject as a 3D volumetric model.** Do not file a 3D ticket or model a volumetric pocket.
- **Integration path:** If visually represented, it belongs as a flat 2D decal quad in the entrance architectural trim (`src/entrance/doors.ts` or `src/entrance/windows.ts`), not an interactive or slotted fixture. Issue #234 (acrylic counter tents) is unaffected.

---

## 2. Early wand scanner

### Reference evidence
- [Video Pc_yHON1oiQ, f0192 (about 382 seconds)](https://youtu.be/Pc_yHON1oiQ?t=382)
- [Video Pc_yHON1oiQ, f0194 (about 386 seconds)](https://youtu.be/Pc_yHON1oiQ?t=386)
- [Video Pc_yHON1oiQ, f0198 (about 394 seconds)](https://youtu.be/Pc_yHON1oiQ?t=394)
- Additional sequence: 382.0s – 389.5s (complete VHS barcode checkout scanning motion).

### Ambiguity addressed
The historical catalog named an "early wand scanner" based on partially occluded frames where the clerk's fingers covered the tool. It was unknown whether early installations used a contact optical wand (pencil/light-pen style) or a handheld gun scanner. Issue #187 tracks the later scanner family.

### Confirmation & findings
- **Distinct wand scanner:** **Negative.** The tool is **not a wand scanner**.
- **Evidence:** During the unoccluded scanning pass between 385.5s and 387.0s (centered on f0194), the clerk holds a video rental case in her left hand and operates the scanner in her right hand. The exposed hardware profile reveals a defined ergonomic pistol-grip handle, a finger trigger, an angular tapered scanner barrel/snout terminating in a forward rectangular scan window, a top housing label plate, and a coiled interface cord exiting the base of the handle.
- **Physical identity:** This is a classic early-1990s trigger-actuated **handheld laser/CCD barcode gun** (comparable to vintage Symbol Technologies LS 2000 / LS 3000 series hardware), completely distinct from a contact wand pen.

### Disposition & coverage
- **Disposition:** **Consolidated into existing handheld scanner family issue #187** ("Blender: build the later handheld barcode scanner").
- **3D Modeling action:** **Do not commission a separate wand model.** Update issue #187's scope to incorporate this verified early-90s pistol-grip gun variant.

### Confirmed variant technical specification (for Issue #187)
- **Construction:** Two-piece molded ABS housing split along the central longitudinal seam, ~15° rear-raked pistol-grip handle, index-finger microswitch trigger, canted optical snout with protective recessed rubber bezel surrounding the scan window, top spec plate recess, and lower strain-relief boot with coiled rubber cable.
- **Estimated scale & dimensions:**
  - Overall height: 0.58 ± 0.04 ft (175 ± 12 mm) — *Confidence: High (proportional to adult clerk hand)*
  - Housing length (front optic to rear overhang): 0.50 ± 0.04 ft (152 ± 12 mm) — *Confidence: High*
  - Head width: 0.20 ± 0.02 ft (61 ± 6 mm) — *Confidence: High*
  - Cable: 0.25-inch diameter black coiled cord; relaxed span 1.8–2.2 ft — *Confidence: High*
- **Placement & integration:**
  - Countertop rest position adjacent to keyboard/terminal at checkout station (`src/entrance/counter.ts`, `counter-terminal.ts`).
  - Cord routes to counter grommet or terminal base.
- **Explicitly unresolved / unknown:**
  - Internal scan engine optics behind the tinted window (laser polygon mirror vs fixed CCD sensor).
  - Idle holster / cradle hardware (whether a desk stand cup existed or the scanner simply rested flat on the counter laminate).

---

## 3. Cream three-tier countertop riser

### Reference evidence
- [Video Pc_yHON1oiQ, f0217 (about 432 seconds)](https://youtu.be/Pc_yHON1oiQ?t=432)
- Additional sequence: 431.0s – 436.0s (wide camera pullback as customer exits counter).

### Ambiguity addressed
Frame f0217 captured a stepped stock display in the background with a blue band beneath it; because the lower portion was cropped by the checkout counter deck, the catalog labeled it a "three-tier countertop riser". It was hypothesized to duplicate the floor sale-pyramid family (#171).

### Confirmation & findings
- **Support relationship (counter vs floor):** **Floor-standing.** The fixture stands **directly on the store floor**, not on the counter.
- **Evidence:** In f0217 at 432s, the camera's high perspective across the counter foreshortens the background. However, at 433.0s–435.5s, as the customer retrieves her tapes and turns toward the exit, the camera pulls out and pans downward. The wide view reveals the fixture in its entirety: it stands squarely on the blue carpeted floor in the cross-aisle between the counter island and the perimeter wall shelving.
- **Physical identity:** It is a three-tier, concentric stepped merchandise pyramid display with cream/beige laminate risers, displaying previously-viewed video cases face-out on all four sides, with a centered vertical header sign frame mounted at the summit.

### Disposition & coverage
- **Disposition:** **Consolidated into existing floor sale-pyramid issue #171** ("Blender: build the stepped previously-viewed sale pyramid").
- **3D Modeling action:** **Reject countertop duplicate.** Closed as a distinct item; all reference observations belong to issue #171.

### Confirmed variant technical specification (for Issue #171)
- **Construction:** Concentric stepped square plinths (3 tiers) built from cream laminate panels, with vertical riser fascias and horizontal merchandise ledges with integral retaining lips. Recessed dark base kick. Crown deck fitted with a slotted channel for a double-sided acrylic/metal promotional sign holder ("PREVIOUSLY VIEWED MOVIES").
- **Estimated scale & dimensions:**
  - Footprint: 3.6 × 3.6 ft square (1.10 × 1.10 m) — *Confidence: High (fits 4-foot aisle clearance)*
  - Base plinth height: 0.50 ft (152 mm)
  - Step rise: ~0.95 ft (290 mm) per tier; step run/depth: ~0.65 ft (198 mm)
  - Height to top step: 3.35 ± 0.15 ft (1.02 ± 0.05 m) — *Confidence: High (waist-height merchandising)*
  - Total height including header sign: 4.40 ± 0.20 ft (1.34 ± 0.06 m)
- **Placement & integration:**
  - Floor fixture in open lobby / customer queue circulation area (`src/fixtures/four-sided-display.ts`, `src/fixtures/pv-drape-table.ts`).
  - Uses standard aisle clearance boundaries.
- **Explicitly unresolved / unknown:**
  - Internal structural ribbing and fastening method.
  - Sub-plinth glides or concealed casters underneath the recessed toe kick.

---

## 4. Small black spinner near checkout

### Reference evidence
- [Video uOEIl5XaptY, f0358 (about 714 seconds)](https://youtu.be/uOEIl5XaptY?t=714)
- [Video uOEIl5XaptY, f0374 (about 746 seconds)](https://youtu.be/uOEIl5XaptY?t=746)
- [Video uOEIl5XaptY, f0382 (about 762 seconds)](https://youtu.be/uOEIl5XaptY?t=762)
- Cross-reference: Photo 51441976 (audit supporting #275).

### Ambiguity addressed
A dark wire display near the checkout queue was cataloged as a "small black spinner". While depth was evident, its mounting base, mobility, and relationship to the newly queued rotating peg merchandiser (#275) were unresolved.

### Confirmation & findings
- **Relationship to newly queued peg merchandiser:** **Confirmed variant.** The fixture is a reference variant of the **mobile rotating peg merchandiser** tracked in #275, **not an unproven separate spinner**.
- **Evidence:** In Video uOEIl5XaptY at 714s, 746s, and 762s (overhead camera overlooking the counter and queue), a tall dark freestanding display is visible standing near the aisle column. The fixture consists of an arched radial caster base, a central vertical steel mast, and a multi-sided wire/pegboard display body with rows of peg hooks displaying hanging blister packages and small accessories.
- **Physical identity:** The video footage corroborates the exact fixture profile identified in Photo 51441976. The earlier catalog designation ("small black spinner") arose from viewing only the upper rotating rack portion; the full video sequence confirms it is the full-height, floor-standing mobile peg merchandiser on casters.

### Disposition & coverage
- **Disposition:** **Consolidated into issue #275** ("Blender: build the caster-base rotating peg merchandiser").
- **3D Modeling action:** **Consolidate directly into #275.** No separate spinner ticket or duplicate 3D model shall be created.

### Confirmed variant technical specification (for Issue #275)
- **Construction:** Central cylindrical chrome/black steel column, radial caster base with arched legs and dual-wheel hooded nylon swivel casters, revolving rectangular black wire/perforated steel peg carrier with upper and lower radial spider brackets, removable steel wire peg hooks (4"–6" depth), and a top metal header card slot.
- **Estimated scale & dimensions:**
  - Overall height: 5.1 ± 0.3 ft (1.55 ± 0.09 m) — *Confidence: High*
  - Base turning radius / caster sweep: 2.0 ± 0.15 ft diameter (610 ± 45 mm) — *Confidence: High*
  - Display panel width: 1.6 ± 0.15 ft (488 ± 45 mm)
  - Display panel height: 3.2 ± 0.2 ft (975 ± 60 mm)
- **Placement & integration:**
  - Floor fixture positioned near checkout queue entrance and perimeter aisle (`src/entrance/counter.ts`, `src/fixtures/period-fixtures.ts`).
  - Independent floor placement on carpet, outside critical walking path.
- **Explicitly unresolved / unknown:**
  - Exact leg count on base (4 arched legs confirmed in video/photo; 5th leg inferred from commercial store fixture standards).
  - Internal thrust bearing or sleeve collar assembly at the rotation hub.

---

## Disposition summary matrix

| Item | Catalog Label | Investigated Evidence | Confirmed Identity | Formal Disposition | Target Issue / Model |
|---|---|---|---|---|---|
| 1 | Mullion brochure pocket | Video Ehu5CKAoHV4 (296s, 298s) | Flat framed notice on entrance frame; no pocket cavity | **Proven printed-only** (no 3D model) | 2D architectural signage (`src/entrance/doors.ts`) |
| 2 | Early wand scanner | Video Pc_yHON1oiQ (382s, 386s, 394s) | Handheld barcode gun with trigger and angled head | **Handheld scanner variant** (not a wand) | Consolidated into **#187** |
| 3 | Cream countertop riser | Video Pc_yHON1oiQ (432s) | Concentric 3-tier stepped display standing on floor | **Floor sale pyramid** (not countertop) | Consolidated into **#171** |
| 4 | Small black spinner | Video uOEIl5XaptY (714s, 746s, 762s) | Tall mobile rotating peg merchandiser on caster base | **Rotating peg merchandiser variant** | Consolidated into **#275** |

All four items have their physical identity, structural geometry, scale, and placement established. None warrant an uncertain or duplicate 3D model ticket. Existing active work and source code remain untouched.

<!-- reference-model-audit-2026-09-07:ambiguous-hardware-study -->
