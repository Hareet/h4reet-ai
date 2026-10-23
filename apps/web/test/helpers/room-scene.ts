// The 3D part the tests' scene module draws (spec 004, T098): the site's build gives src/room/scene.ts
// `virtual:room-scene` through roomBundle() (build/room/plugin.ts), and vitest.config.ts resolves it here, to the
// repository's 3D part as the site's build composes it.
import { repositoryBundle } from "./room";

export default repositoryBundle().scene;
