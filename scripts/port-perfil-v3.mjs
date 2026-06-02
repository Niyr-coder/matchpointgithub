import fs from "fs";
import path from "path";

const srcDir =
  "C:/Users/Andre/Downloads/MATCHPOINT Design System (8)/design_handoff_mi_perfil_v3/src";
const destDir = "src/components/dashboard/user/profile-v3";

const files = [
  "PerfilShared.jsx",
  "PerfilV2Shared.jsx",
  "PerfilV2.jsx",
  "PerfilV2Sections.jsx",
  "PerfilV3.jsx",
  "PerfilV3Scout.jsx",
];

function transform(content) {
  let c = content;
  c = c.replace(/\/\/[^\n]*Object\.assign\(window[\s\S]*?;\s*\n?/g, "");
  c = c.replace(
    /React\.useEffect\(\(\) => \{ if \(window\.lucide\) window\.lucide\.createIcons\(\); \}\);?\s*\n?/g,
    "",
  );
  c = c.replace(
    /<i data-lucide="([^"]+)" style=\{\{ width: (\d+), height: (\d+)(?:, color: ([^}]+))?\s*\}\} \/>/g,
    (_, name, w, _h, col) =>
      col
        ? `<HandoffIcon name="${name}" size={${w}} color={${col}} />`
        : `<HandoffIcon name="${name}" size={${w}} />`,
  );
  c = c.replace(
    /<i data-lucide=\{([^}]+)\} style=\{\{ width: (\d+), height: (\d+) \}\} \/>/g,
    '<HandoffIcon name={$1} size={$2} />',
  );
  c = c.replace(/\bPERFIL_ME\b/g, "usePerfilV3Data()");
  c = c.replace(/Object\.assign\(window,[\s\S]*?\);\s*$/m, "");
  return c;
}

const extraImports = {
  "PerfilV2Shared.tsx": "",
  "PerfilV2.tsx": `import { v2tk, V2_PINS, V2_PERSONALIZATION, v2Sub } from "./PerfilV2Shared";
import { AvatarBlob, Sparkline, ViewLabel } from "./PerfilShared";
import { usePerfilV3Data } from "./PerfilV3Context";
`,
  "PerfilV2Sections.tsx": `import { v2tk, V2_ADVANCED, v2Sub } from "./PerfilV2Shared";
import { usePerfilV3Data } from "./PerfilV3Context";
`,
  "PerfilV3.tsx": `import { v2tk, v2Sub } from "./PerfilV2Shared";
import { AvatarBlob, Sparkline, ViewLabel } from "./PerfilShared";
import { V2Hero, V2H2HBanner, V2Showcase, V2KPIs } from "./PerfilV2";
import { V2Locked } from "./PerfilV2Sections";
import { usePerfilV3Data } from "./PerfilV3Context";
`,
  "PerfilV3Scout.tsx": `import { v2tk } from "./PerfilV2Shared";
import { AvatarBlob } from "./PerfilShared";
import { V2Hero, V2Showcase, V2KPIs } from "./PerfilV2";
import { V3AnalyticsBand, V3SocialBand, V3ActivityBand, V3CommunityBand } from "./PerfilV3";
import { usePerfilV3Data } from "./PerfilV3Context";
`,
};

const headerBase = `'use client';

import React from "react";
import { HandoffIcon } from "./HandoffIcon";

`;

const exportsByFile = {
  "PerfilV2Shared.tsx": `export { V2_W, v2tk, V2_PINS, V2_ADVANCED, V2_PERSONALIZATION, v2Sub };`,
  "PerfilV2.tsx": `export { V2Hero, V2H2HBanner, V2Showcase, V2KPIs };`,
  "PerfilV2Sections.tsx": `export { V2Locked };`,
  "PerfilV3.tsx": `export { PerfilV3Board };`,
  "PerfilV3Scout.tsx": `export { PerfilV3BoardScout };`,
};

fs.mkdirSync(destDir, { recursive: true });

for (const f of files) {
  if (f === "PerfilShared.jsx") continue;
  const raw = fs.readFileSync(path.join(srcDir, f), "utf8");
  let body = transform(raw);
  const out = f.replace(".jsx", ".tsx");
  const extra = extraImports[out] ?? `import { usePerfilV3Data } from "./PerfilV3Context";\n`;
  const exp = exportsByFile[out] ? `\n${exportsByFile[out]}\n` : "";
  fs.writeFileSync(path.join(destDir, out), headerBase + extra + body + exp);
  console.log("wrote", out);
}
