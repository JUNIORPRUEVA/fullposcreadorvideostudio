import React from "react";
import { Composition } from "remotion";
import { FullPOSPremiumVertical } from "./templates/FullPOSPremiumVertical.js";
import { BackgroundSourcePlate, HybridMobilePreview } from "./templates/HybridAiScene.js";
import { ProfessionalCourseTemplate, QuickTutorialTemplate } from "./templates/GeneralVideoTemplates.js";
import { defaultRenderPayload } from "./payload.js";

export const RemotionRoot = () => (
  <>
    <Composition
      id="FullPOSPremiumVertical"
      component={FullPOSPremiumVertical}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ payload: { ...defaultRenderPayload, durationSeconds: 30 } }}
    />
    <Composition
      id="HybridMobilePreview"
      component={HybridMobilePreview}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        payload: {
          ...defaultRenderPayload,
          durationSeconds: 5,
          audio: { voiceoverEnabled: false, musicEnabled: false },
          visual: { ...defaultRenderPayload.visual, aiSceneMode: "hybrid", aiMotionIntensity: "cinematic" }
        }
      }}
    />
    <Composition
      id="AiBackgroundSourcePlate"
      component={BackgroundSourcePlate}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="QuickTutorialPreview"
      component={QuickTutorialTemplate}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ payload: { ...defaultRenderPayload, videoType: "QUICK_TUTORIAL", template: "quick-tutorial", format: "9:16", durationSeconds: 20, subtitleMode: "AUTO_FROM_NARRATION", narrationStyle: "QUICK_TUTORIAL", audio: { voiceoverEnabled: false, musicEnabled: false } } }}
    />
    <Composition
      id="ProfessionalCoursePreview"
      component={ProfessionalCourseTemplate}
      durationInFrames={540}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ payload: { ...defaultRenderPayload, videoType: "COURSE", template: "professional-course", format: "16:9", durationSeconds: 18, subtitleMode: "AUTO_FROM_NARRATION", narrationStyle: "TRAINING", audio: { voiceoverEnabled: false, musicEnabled: false } } }}
    />
  </>
);
