# AI image prompts for the five collections cards

These five slots currently render a marked placeholder (warm gradient plus the
existing thin line icon plus a small corner tag). Drop the finished files here
and they load instantly, no code changes needed.

Files to produce:

| Card | WebP (primary) | JPG fallback |
| --- | --- | --- |
| Makeup | images/card-makeup.webp | images/card-makeup.jpg |
| Skincare | images/card-skincare.webp | images/card-skincare.jpg |
| Haircare | images/card-haircare.webp | images/card-haircare.jpg |
| Personal Care | images/card-personalcare.webp | images/card-personalcare.jpg |
| Gifting | images/card-gifting.webp | images/card-gifting.jpg |

Spec for every file: 4:5 portrait, 1200x1500 px, under 150 KB after export.
Any tool works (Midjourney, Ideogram, Firefly, ChatGPT). After export, open
each image and check: no garbled text, no fake logos, no distorted objects.
Regenerate anything that fails.

## Shared style for all five

Luxury beauty still life, soft studio light from the top left, warm shadows,
matte surfaces, shallow depth of field, palette of deep wine #6E1520, store
red #B3262E, peach blush #EBC9B6, light oak #D8B98E and warm ivory #FBF6F0,
minimal arched niche or curved plinth echoing the shop's arched entrance,
editorial and calm, high-end magazine product photography.

## Hard rules for every image

NO brand names, NO logos, NO readable text or labels, NO people or faces,
NO hands, NO sale signs, nothing that looks like a real branded product.
Generic unbranded packaging only.

## Per-card prompts

- Makeup: "Luxury makeup still life on a curved blush plinth inside an arched niche: unbranded matte lipsticks, a open eyeshadow palette, a powder compact and soft brushes, warm oak shelf edge, soft wine and blush tones, editorial studio lighting, 4:5, no text, no logos"
- Skincare: "Luxury skincare still life: unbranded frosted glass serum dropper bottle, a cream jar and a pump bottle on a light oak slab, a soft ivory arch behind, a drop of water and a small green leaf shadow, warm peach light, calm spa mood, 4:5, no text, no logos"
- Haircare: "Luxury haircare still life: unbranded tall shampoo and conditioner bottles with plain matte labels, a wooden comb and a silk scrunchie on a wine-coloured fabric drape, arched niche, warm rim light, 4:5, no text, no logos"
- Personal Care: "Luxury personal care still life: unbranded body wash, a bar of soap, a loofah and a folded ivory towel on a pale oak shelf in an arched niche, soft peach light, fresh clean mood, 4:5, no text, no logos"
- Gifting: "Luxury gifting still life: an elegant wine-red gift box with ivory ribbon, a small bouquet of dried flowers and an unbranded perfume bottle on a blush plinth inside an arched niche, warm glow, celebratory but calm, 4:5, no text, no logos"

## After you drop the files in

Nothing else to do: the cards reference these exact filenames. Keep the
"Illustrative image" corner tag in place, it is meant to stay even after the
images arrive, because these are atmosphere shots rather than photos of stock
the shop carries. When you eventually photograph real shelves, swap the
markup at the EDIT markers in index.html (search "EDIT: AI image slot").
