import { Controller, Get } from "@nestjs/common";
import { templateCatalog, videoTypes } from "./video-studio.metadata.js";

@Controller("video-studio")
export class VideoStudioController {
  @Get("metadata")
  metadata() {
    return {
      productName: "FullPOS Video Studio",
      subtitle: "Videos profesionales para publicidad, capacitación y contenido de marca.",
      videoTypes,
      templates: templateCatalog,
      exportPresets: [
        { id: "reels-1080x1920", label: "Reels 1080x1920", format: "9:16", width: 1080, height: 1920 },
        { id: "youtube-1920x1080", label: "YouTube 1920x1080", format: "16:9", width: 1920, height: 1080 },
        { id: "course-1080p", label: "Course 1080p", format: "16:9", width: 1920, height: 1080 },
        { id: "social-square", label: "Social Square", format: "1:1", width: 1080, height: 1080 },
        { id: "social-4x5", label: "Social 4:5", format: "4:5", width: 1080, height: 1350 }
      ]
    };
  }
}
