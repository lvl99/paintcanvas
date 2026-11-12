// Writes pre-compiled ajv validators for the asset, drawing message, document and settings schemas. Run with: node scripts/build-validators.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateValidatorsCode } from "../src/lib/validation/standalone.ts";

const output = fileURLToPath(
  new URL("../src/lib/validation/validators.generated.js", import.meta.url),
);
writeFileSync(output, generateValidatorsCode());
console.log(`Wrote ${output}`);
