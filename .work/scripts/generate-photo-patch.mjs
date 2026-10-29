import fs from 'fs';
import path from 'path';

const root = process.cwd();
const sourcePath = path.join(root, 'index.html');
const tempPath = path.join(root, '.work', 'patches', 'index.html.photo-fix');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
let fixed = source;

const replacements = [
[` .archexp{position:relative; width:min(777px,72vw); aspect-ratio:777/309; border-radius:50% 50% 0 0/40% 40% 0 0;
  overflow:hidden; background-size:cover; background-position:center 30%; background-color:var(--card);
}
.archexp::after{content:"";position:absolute; inset:0; box-shadow:inset 0 0 0 1px rgba(255,244,235,.14);
  border-radius:inherit; pointer-events:none}
.archexp img{position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
  transform:scale(1.18); object-position:center 32%; will-change:transform}`.slice(1),
`.archexp{position:relative; width:min(1118px,100%); margin-inline:auto; padding:clamp(16px,2.2vw,30px);
  background:var(--card); isolation:isolate;
}
.archexp::before{content:"";position:absolute; z-index:-1; inset:0; transform:translateY(-14px);
  border:1px solid rgba(235,201,182,.5); border-radius:50% 50% 0 0/30% 30% 0 0;
  box-shadow:0 0 0 10px rgba(235,201,182,.05); pointer-events:none}
.archexp::after{content:"";position:absolute; inset:clamp(16px,2.2vw,30px); border:1px solid rgba(255,244,235,.18);
  border-radius:8px; pointer-events:none}
.archexp img{position:relative; width:100%; height:auto; aspect-ratio:auto; object-fit:contain;
  object-position:center; transform:none; will-change:auto; border-radius:8px; background:var(--card)}`],
[` .exp-frame{position:relative; width:min(378px,100%); aspect-ratio:378/742;
  border-radius:50% 50% 0 0/30% 30% 0 0; overflow:hidden;
  box-shadow:0 34px 70px -30px rgba(89,55,35,.5)}
.exp-frame img{width:100%; height:100%; object-fit:cover; object-position:center 30%}
.exp-frame::after{content:"";position:absolute;inset:0;border-radius:inherit;
  box-shadow:inset 0 0 0 1px rgba(42,37,35,.12); pointer-events:none}`.slice(1),
`.exp-frame{position:relative; width:min(378px,100%); padding:16px; aspect-ratio:auto;
  border-radius:0; overflow:visible; isolation:isolate}
.exp-frame::before{content:"";position:absolute; z-index:-1; inset:0; transform:translateY(-12px);
  border:1px solid rgba(179,38,46,.42); border-radius:50% 50% 0 0/28% 28% 0 0;
  box-shadow:0 0 0 10px rgba(179,38,46,.05); pointer-events:none}
.exp-frame img{position:relative; width:100%; height:auto; aspect-ratio:auto; object-fit:contain;
  object-position:center; border-radius:8px; background:var(--ivory)}
.exp-frame::after{content:"";position:absolute;inset:16px;border-radius:8px;
  box-shadow:inset 0 0 0 1px rgba(42,37,35,.16), 0 34px 70px -30px rgba(89,55,35,.5); pointer-events:none}`],
[`  .exp-frame{width:min(300px,72vw); aspect-ratio:378/742}`,
`  .exp-frame{width:min(300px,72vw); aspect-ratio:auto}`],
[` .mens{position:relative; padding:clamp(100px,16vh,190px) var(--margin); overflow:hidden}`.slice(1),
`.mens{position:relative; padding:clamp(100px,16vh,190px) var(--margin); overflow:visible}`],
[` .mens-photo{width:min(378px,58vw); aspect-ratio:378/739; border-radius:50% 50% 0 0/26% 26% 0 0;
  overflow:hidden; position:relative; transform:translateY(6svh)}
.mens-photo img{width:100%; height:100%; object-fit:cover; will-change:transform}
.mens-photo::after{content:"";position:absolute;inset:0;border-radius:inherit;
  box-shadow:inset 0 0 0 1px rgba(255,244,235,.16); pointer-events:none}`.slice(1),
`.mens-photo{width:min(378px,58vw); padding:16px; aspect-ratio:auto; border-radius:0;
  overflow:visible; position:relative; transform:none; isolation:isolate}
.mens-photo::before{content:"";position:absolute; z-index:-1; inset:0; transform:translateY(-12px);
  border:1px solid rgba(235,201,182,.42); border-radius:50% 50% 0 0/24% 24% 0 0;
  box-shadow:0 0 0 10px rgba(235,201,182,.04); pointer-events:none}
.mens-photo img{position:relative; width:100%; height:auto; aspect-ratio:auto; object-fit:contain;
  object-position:center; border-radius:8px; will-change:auto; background:var(--bg)}
.mens-photo::after{content:"";position:absolute;inset:16px;border-radius:8px;
  box-shadow:inset 0 0 0 1px rgba(255,244,235,.16); pointer-events:none}`],
[`                <!-- EDIT: card image lives at images/card-mensgrooming.jpg (webp optional; jpg already in place) -->`,
`                <!-- EDIT: collection card remains illustrative; the real portrait is reserved for Shop for Him. -->`],
[`        <img id="mensImg" src="images/card-mensgrooming.jpg" width="1200" height="1500" loading="lazy" decoding="async"
             alt="Illustrative men's grooming still life with unbranded pumps, a razor and a shaving brush on a plinth">`,
`        <img id="mensImg" src="images/mens-section.jpg" width="378" height="739" loading="lazy" decoding="async"
             alt="A portrait view of the men's grooming section, with wooden shelves and care products">`],
[`    // arch expander: arch grows while the photo settles (transform + object zoom only)
    var arch = $('#archExp');
    if (arch) {
      var img = $('#sfImg');
      window.gsap.fromTo(arch, { scale: 0.62 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: arch, start: 'top 92%', end: 'top 38%', scrub: 0.6 }
      });
      if (img) {
        window.gsap.fromTo(img, { scale: 1.18, yPercent: -2 }, {
          scale: 1.02, yPercent: 1.5, ease: 'none',
          scrollTrigger: { trigger: arch, start: 'top 92%', end: 'bottom 30%', scrub: 0.6 }
        });
      }
    }`,
`    // Real photos stay at their natural aspect ratio. The arch is decorative CSS,
    // so no ScrollTrigger transform may move or enlarge the pixels.`],
[`    if (mi) {
      window.gsap.fromTo(mi, { yPercent: -7 }, {
        yPercent: 7, ease: 'none',
        scrollTrigger: { trigger: '#mens', start: 'top bottom', end: 'bottom top', scrub: 0.4 }
      });
    }
`, ``]
];

for (const [oldBlock, newBlock] of replacements) {
  if (!fixed.includes(oldBlock)) throw new Error(`Replacement block not found: ${oldBlock.slice(0, 100)}`);
  fixed = fixed.replace(oldBlock, newBlock);
}
fs.writeFileSync(tempPath, fixed, 'utf8');
console.log(tempPath);
