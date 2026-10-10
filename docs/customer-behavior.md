# Customer visits and parking

Regulars choose actual stocked shelf sections, reserve their destination and keep
2.6 feet between bodies on the floor. Reserved browsing positions sit at least
four feet apart, so neighbouring sections never hold a shoulder-to-shoulder
pair; the counter and door keep their own turn-taking. Temporary occupied cells use the shared clerk
A* grid; segment checks visit every crossed grid cell, including corner crossings.
A remaining route reserves its corridor until it is traversed, so crossing or
opposing paths wait their turn. Counter turns and the entrance have explicit
ownership; new browsing routes wait while the next counter customer approaches.
A blocked shopper waits before replanning. An occupied position sends the next
shopper to another reachable section. Empty fixtures and request-only cases are
not browsing destinations; displayed streaming titles remain available.

Preferences are explicit identity data in `customer-preferences.ts`. Customer 08
(windbreaker) favors games, customer 07 (rose cardigan) favors suspense/thrillers,
and customer 04 (plaid shirt) favors action. The other seven have individually
authored primary and secondary tastes, covering comedy, drama, romance, horror,
science fiction, documentary and animation. Favored sections
have weight twelve, secondary choices weight four, and other available departments
weight one. An unlabeled all-genre section earns only the matching share of its
departments, so a mixed shelf holding one comedy is not every comedy fan's
favorite. Department weights are divided across their available positions so
a longer aisle does not overwhelm a smaller department. Missing, unreachable or
occupied choices leave alternatives available. Nothing derives preferences from
age or gender.

Profiles are maintained in the identity data rather than visitor settings.
Legacy customer preference and population settings are ignored. Population
targets follow the store's time of day: morning two, afternoon four, sunset
eight and night five. All ten identities rotate through the roster. Missing
artwork, stock, reachable stops or parking can reduce actual admission.

Admission requires both a reachable browsing position and an eligible parking
space. The same visit owns the position and car throughout browsing and checkout.
Shoppers leave through the store-side door approach, release their car and return
after a staggered absence, with a fresh capacity check. The clerk grid excludes
the vestibule: the approach is the visit boundary; exterior driving or walking
animation is not implemented. The opening population is already browsing.
Inactivity/back-room sleep pauses visits and keeps their parked cars. Switching
time of day or rebuilding the scene releases the old ownership/resources.

The only admitted asset in this inventory is the existing original generic
1987-era hatchback documented in [its model notes](car-hatchback-model.md).
Its mesh data is retained, with uniform scaling to a 14-foot length and grounded
origin. Colors identify regulars; there are no unrelated decorative cars. The
nine-by-eighteen-foot spaces come from the actual exterior plan, leaving its
hatched entrance approach and driveway clear. Accessible/reserved spaces are
excluded when marked. A full lot, an earlier year or an oversized vehicle refuses
admission. All rendering tiers use the same assignments and dimensions; a missing
asset retains an explicitly procedural loading/error silhouette. That silhouette
is a fallback, not a new original modeled vehicle.

This is a bounded implementation referenced by issues 376 and 377. A period
sedan, wider original vehicle inventory and additional car reference/model work
remain unresolved. No additional unclear preference category is encoded.

## Verification

`npm run check` builds production and runs the complete test suite. Focused
`tests/customer-lifecycle.test.ts` covers authored preferences, department size
bias, unavailable/crowded destinations, admission/capacity, reserved/access bays,
model-year/dimension rejection, separation, repeated checkout/departure/arrival,
ownership cleanup, exact corner traversal and six admission orders on a captured
public production floor. Browser verification runs the
actual production scene with ten regulars, plus low/medium/high quality, the
small-store format, a missing vehicle asset, empty stock and the former Customers
Off setting. Those captures predate automatic time-of-day populations; they are
historical lifecycle evidence rather than proof that an Off control still exists.

Findable photographs and a short deterministic movement capture are linked below.
The video advances the real simulation by 0.1 seconds per captured frame; its
encoding frame rate is not an app performance measurement. The photographs use
public assets and illustrative stocked catalog data.

- [Several shoppers](screenshots/customer-lifecycle/shoppers-inside.jpg)
- [Assigned cars in actual spaces](screenshots/customer-lifecycle/occupied-lot.jpg)
- [Lot after the shoppers depart](screenshots/customer-lifecycle/departed-lot.jpg)
- [Short shopper movement recording](presentation/customer-movement.mp4)
