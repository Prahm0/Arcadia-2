# App Store screenshots (version 1.2)

Sage Day design, four per device, in upload order.

| # | File | Caption | Screen |
|---|------|---------|--------|
| 1 | `01-today.png` | Your day, planned for you | Today: the hero block, the ring and the streak |
| 2 | `02-tell-arcad.png` | Life happened? Just tell Arcad | "I have a chem test Thursday", applied, and the revision it planned |
| 3 | `03-block-done.png` | Every block counts | The block-done moment after ticking a block |
| 4 | `04-week.png` | Your week, sorted | Next week's schedule |

## Sizes

- `iphone-6.9/`: 1320 x 2868, the iPhone 6.9" display slot.
- `ipad-13/`: 2064 x 2752, the iPad 13" display slot.

All are RGB PNGs with no alpha channel.

## How they were made

- Captured from the real app running locally, inside a stand-in for the iOS Capacitor shell, so they show the native layout: no wordmark on iPhone, and App Store billing.
- iPhone captures are 440 x 956 points at 3x. iPad captures are 1032 x 1376 points at 2x, the iPad's own layout: the sidebar in 1 and 4, and the collapsed rail with the Arcad panel in 2.
- The status bar, device frame and caption are drawn around each capture.
- The demo student is Mia Thompson, Year 12: Chemistry, Mathematical Methods, English, Biology and Psychology. She has school on weekdays, netball on Thursday and a six-day streak.
- Arcad's reply in screen 2 came from a local stand-in model that answers the chem test the way production Arcad does. Applying it went through the real plan-change flow.
- The callout in iPhone screen 2 is Sunday's card from the Week view after the change was applied.
