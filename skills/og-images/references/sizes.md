# Sizes and safe zones

Checked on **19 November 2026**. These move; if the date is more than a few months old, open the source for the row
you need before you render.

## Link preview (Open Graph, X card, Slack, iMessage, LinkedIn)

**1200 × 630** (1.91:1), PNG, under 5 MB. This is the size `og:image` previews are laid out for and the one the major
platforms crop to. Always set `og:image:width` and `og:image:height` and an `og:image:alt`; use an absolute URL.
`twitter:card` is `summary_large_image`. Source: the Open Graph protocol, https://ogp.me (`og:image:width`,
`og:image:height`, `og:image:alt`). The 1200 × 630 and 5 MB figures are the common platform guidance, not part of the protocol.

How it is shown: in a feed the card is often 500 to 600 px wide and in a chat thumbnail about 300 px. The guard sets a
minimum cap height of **40 px** at full size for the title (20 px at 600 wide, 10 px at 300 wide).

## Product Hunt gallery

**1270 × 760** px, recommended. Verified 19 November 2026 on Product Hunt's own help centre, "Build your product page"
(Launch media, "Recommended size: 1270x760px"):
https://help.producthunt.com/en/articles/17834537-4-build-your-product-page

The same page asks for at least 1 image; its checklist suggests 3 or more. This skill makes 4 to 6: slide 1 is the
hero, each other slide one benefit. The page gives no file-size limit for gallery images (the 2 MB limit there is for
the logo). Third-party guides say 3 MB; the slides here are well under 1 MB.

## X (Twitter) header

**1500 × 500** (3:1). X's own help page, "Help with uploading a profile photo", read on 19 November 2026:
https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo
It says "Recommended dimensions for header images are 1500x500 pixels" and that parts of a header may be cropped
("60 pixels on the top and bottom could be cropped"), depending on monitor size and browser.

X publishes no avatar zone. The one used here was **measured on x.com on 19 November 2026** with a real profile photo:

| Where | The profile photo covers (in header image pixels) |
|---|---|
| Desktop (photo about 146 px on screen) | x 35 to 401, y 311 to 500 |
| Phone | x 54 to 414, y 332 to 500 |

What the guard enforces: everything that matters sits inside **x 40 to 1460, y 70 to 430** (X says 60 px top and bottom
may go; 70 leaves a margin), and nothing is in the profile photo zone **x under 420, y over 300**. The template puts the
text block at x 440 and the capture to its right, so the left 420 px are scenery: that is where the profile photo sits.
Check the result on a phone and on desktop; X can change this layout.
