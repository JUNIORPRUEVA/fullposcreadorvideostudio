export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "brand";
}

export function safeBrandExport(brand: Record<string, unknown>) {
  const {
    id,
    name,
    slug,
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    textColor,
    website,
    whatsapp,
    email,
    defaultCTA,
    defaultOffer,
    defaultPriceText,
    defaultVoiceProfile,
    defaultNarrationStyle,
    defaultMusicTrackId,
    defaultMusicVolume,
    defaultIntroTemplate,
    defaultOutroTemplate,
    watermarkEnabled,
    watermarkPosition,
    watermarkOpacity,
    fontHeading,
    fontBody,
    musicPreferences,
    pronunciationDictionary
  } = brand;
  return {
    version: 1,
    brand: {
      id,
      name,
      slug,
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      textColor,
      website,
      whatsapp,
      email,
      defaultCTA,
      defaultOffer,
      defaultPriceText,
      defaultVoiceProfile,
      defaultNarrationStyle,
      defaultMusicTrackId,
      defaultMusicVolume,
      defaultIntroTemplate,
      defaultOutroTemplate,
      watermarkEnabled,
      watermarkPosition,
      watermarkOpacity,
      fontHeading,
      fontBody,
      musicPreferences,
      pronunciationDictionary
    }
  };
}
