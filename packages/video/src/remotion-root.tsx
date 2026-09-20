import React from "react";
import { Composition } from "remotion";
import { FullPOSPremiumVertical } from "./templates/FullPOSPremiumVertical.js";

export const RemotionRoot = () => (
  <Composition
    id="FullPOSPremiumVertical"
    component={FullPOSPremiumVertical}
    durationInFrames={750}
    fps={30}
    width={1080}
    height={1920}
  />
);
