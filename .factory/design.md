# Room Ready — visual thesis

## Direction

**Cinematic environmental art: “doors open in five.”** Room Ready lives in the
quiet minute before a shared game begins. The visual world is an empty evening
living room/classroom: a screen warming up, chairs gathered, and each device
represented by a small pool of light. It should feel prepared and hospitable,
not competitive or arcade-like. Interface chrome stays low-contrast; readiness
signals are bright and legible like practical lights on a set.

The single-mode dark treatment is intentional: it works on a TV without
flooding the room, gives status lights strong contrast, and is recognizably
different from a dashboard template. A faint paper-grain layer and offset
architectural rules give the utility screen the tactility of a call sheet.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Night / background | `#0B1113` | painted page background |
| Slate / surface | `#142025` | panels and fields |
| Raised | `#1B2B31` | selected/interactive surfaces |
| Chalk / text | `#F4F0E6` | primary copy |
| Mist / muted | `#B8C3BF` | supporting copy (≥ 4.5:1 on night) |
| Pool light / accent | `#79E6D0` | primary action and focus |
| Ink on accent | `#06201B` | accent contrast |
| Lamp / warning | `#F5C46B` | needs-attention state |
| Exit / danger | `#FF8C82` | failed check, destructive action |
| Ready / success | `#9DE28D` | passed check |

No gradient is used. Depth comes from solid planes, shadows, framing and the
environmental image.

## Type

- Display: Georgia, `Times New Roman`, serif. Its broad, human letterforms make
  the setup feel like an invitation rather than admin software.
- Utility/body: Inter-compatible system stack (`ui-sans-serif`, `system-ui`,
  sans-serif). It stays highly legible on old phones and avoids a font
  download. Tabular figures are enabled for room codes and timers.
- Scale: 16px body, 20px lead, 24px section, fluid 40–72px display. Measures
  remain 45–70 characters.

## Spacing and shape

An 8px base rhythm: 4, 8, 12, 16, 24, 32, 48, 64. Corners are 6px for controls
and 18px only for large independent stage panels. Asymmetric desktop grids
evoke a film frame; phone layouts become one deliberate vertical sequence.
Controls are at least 48px high with 12px separation.

## Interaction grammar

- “Open the room” is the one hero action. It creates a four-letter code and a
  host-bound private token locally, then moves into the room board.
- Guest cards arrive from the lower edge and settle into the same horizontal
  “bench.” Each check is label + icon + text; color is never the only signal.
- Readiness is honest: browser/input/network/screen-wake checks are measured;
  game fit is a host-entered requirement comparison, never a compatibility
  claim about an untested title.
- A rehearsal pad verifies taps, swipes, multi-touch and keyboard/gamepad
  input without installing anything.
- TV/print view removes control chrome and enlarges the room code, URL, and QR.

## Motion

UI transitions last 180–240ms and use opacity/translate only. New guests rise
from the bench they join; status changes briefly illuminate their local panel.
Nothing loops. Under `prefers-reduced-motion: reduce`, transforms and smooth
scrolling are removed and state changes are immediate. The practice screen is
still fully understandable through text counters.

## Responsive intent

- TV/desktop: image and invitation share the opening frame; room board shows
  roster and summary side by side.
- 390px phone: environmental image becomes a shallow establishing frame;
  secondary explanation is shortened, actions are full width, and room code
  remains above the fold. No horizontal scrolling.
- Print: monochrome-friendly join card, white background, only join details,
  QR, and one sentence of instruction.

## Asset plan and provenance

### Hero environment

Subject: an empty, welcoming living room/classroom before a group game, low
console with a glowing blank television, semicircle of mismatched chairs,
several generic phones/controllers resting on seats as points of light.

World/materials: painted plaster, wool, worn oak, frosted glass, matte
electronics. Light/lens: cinematic 28mm eye-level composition, blue-hour
window light balanced by one warm practical lamp, soft film grain, generous
negative space on the left. Palette words: midnight slate, chalk, pool-light
teal, tungsten amber. Negative list: people, faces, readable text, logos,
brands, game characters, neon cyberpunk, gradients, oversaturation, distorted
devices, watermark.

Full prompt derived from this sheet is stored beside the source asset. The
image is generated specifically for Room Ready with the Factory Azure OpenAI
image deployment, then reviewed for text/brand/anatomy/seam artifacts and
exported to responsive WebP variants. Generated imagery is disclosed in the
footer and is licensed as part of this MIT project.

### Authored graphics

Status marks, room plan linework, and QR framing are original CSS/SVG authored
for this product. No stock icon library or third-party imagery is used.
