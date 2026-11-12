import AssetFile, { assetsToVersion2 } from "../../assets";
import { validateProfileGraphCollection } from "../../validation/validators.generated.js";
import type { ProfileGraph } from "..";
import {
  PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION,
  PROFILE_GRAPH_COLLECTION_TYPE,
  PROFILE_GRAPH_TYPE,
  UNTITLED_PROFILE_NAME,
} from "../schema";

/**
 * Reads and writes profile graph collection files. Files of version 1 are migrated.
 *
 * @example
 * const graphs = profileGraphFile.parse(await file.text()); // throws AssetFileError
 * const json = profileGraphFile.write(app.profiles.graphs);
 */
export const profileGraphFile = new AssetFile<ProfileGraph>({
  schema: "profile-graph-collection",
  version: PROFILE_GRAPH_COLLECTION_SCHEMA_VERSION,
  type: PROFILE_GRAPH_COLLECTION_TYPE,
  validate: validateProfileGraphCollection,
  fileName: "profile-graphs",
  migrations: [assetsToVersion2(PROFILE_GRAPH_TYPE, UNTITLED_PROFILE_NAME)],
});
