"use client";

import dynamic from "next/dynamic";

/* On-demand WebGL scenes. three.js is ~535 KB; importing the scenes directly
   put it in the shared bundle of every page (the 404 page is part of the root
   layout). Loaded this way, it downloads only where a scene is shown, after
   the page itself is interactive. Client-only: WebGL has nothing to render on
   the server. */
export const NeuralScene = dynamic(() => import("./NeuralScene").then((m) => m.NeuralScene), { ssr: false });
export const RetentionOrbit = dynamic(() => import("./RetentionOrbit").then((m) => m.RetentionOrbit), { ssr: false });
