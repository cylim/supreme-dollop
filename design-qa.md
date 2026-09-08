# Design QA

- **Source visual truth:** `/home/cyomarchy/.t3/userdata/attachments/c270c192-9b1c-4674-b013-1eb4499a57ad-0f2ef385-c137-4d50-a227-d262e5a8360d.png`
- **Implementation screenshot:** `.artifacts/design-qa/candidate-tabs-mobile.png`
- **Combined comparison:** `.artifacts/design-qa/candidate-comparison.png`
- **Closing CTA screenshot:** `.artifacts/design-qa/landing-closing-cta-desktop.png`
- **Viewport:** 390 × 844 CSS px for the candidate editor; 390 × 844 and 1280 × 800 CSS px for the landing CTA
- **Pixels and density:** source 836 × 1268 px; implementation 780 × 1688 px at device pixel ratio 2; focused comparison normalizes both candidate regions to approximately 418 CSS-width pixels
- **State:** authenticated new-schedule form with Exact time selected; signed-out landing page with the closing CTA visible

## Full-view comparison evidence

The implementation keeps the source's cream card, green section label, soft-green editor surface, rounded controls, outlined action, and candidate footer. The deliberate change is structural: the two stacked mode cards are represented by a segmented tab control and only the selected editor is rendered. This reduces the mobile section height without changing the exact-time or rough-window behavior.

The landing CTA uses the same palette, radii, typography, and Google sign-in control as the existing landing page. It sits after the two information panels and before the global footer without horizontal overflow at either tested breakpoint.

## Focused comparison evidence

The combined candidate comparison checks the most detailed region because it contains the relevant typography, spacing, form controls, button treatment, and candidate count. No additional image-asset comparison was needed: neither the source nor implementation contains raster artwork, logos, or decorative imagery in this region.

## Required fidelity surfaces

- **Fonts and typography:** Existing app type family and weights are preserved. Section labels, editor headings, supporting copy, controls, and buttons retain the source hierarchy and readable mobile wrapping.
- **Spacing and layout rhythm:** Card padding and radii remain consistent. The selected panel aligns with the tab list, candidate count remains separated below it, and both mobile views are free of horizontal overflow.
- **Colors and visual tokens:** Cream, forest green, muted green-gray, pale editor green, and border colors remain consistent with the source and the rest of JRNY Plan.
- **Image quality and asset fidelity:** No image assets are required for these controls. Existing text and UI controls remain code-native; no placeholder or recreated artwork was introduced.
- **Copy and content:** Exact time, Rough window, editor guidance, actions, and candidate controls are preserved. The new closing CTA clearly repeats the primary schedule-creation action without introducing a second flow.

## Interaction and browser checks

- Click switching reveals the Rough window panel with two date-time inputs and the Generate from range action.
- Arrow-key switching moves focus and selection back to Exact time.
- `aria-selected`, `aria-controls`, `tabIndex`, tabpanel labels, and focus movement were verified in the rendered page.
- The candidate editor and landing CTA were checked at 390 × 844; the landing CTA was also checked at 1280 × 800.
- The collaborative browser reported no page or console diagnostics on the successful captures.

## Findings

No actionable P0, P1, or P2 differences remain. The shorter editor is the requested intentional deviation from the supplied before-state screenshot.

## Comparison history

The first rendered comparison showed the requested two-mode tab structure, retained the source visual language, and introduced no P0/P1/P2 issue, so no corrective visual iteration was needed.

## Implementation checklist

- [x] Preserve both candidate-generation modes.
- [x] Make the tab control mouse- and keyboard-operable.
- [x] Keep selected-mode values when switching tabs.
- [x] Add the closing landing CTA before the footer.
- [x] Verify mobile and desktop responsiveness.

## Follow-up polish

No P3 follow-up is required for this pass.

final result: passed
