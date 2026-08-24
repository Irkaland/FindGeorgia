const signalRules = [
  ["PAYMENT_DEMAND", /pay me|send money|payment|ფული|გადამიხად/i],
  ["EXTORTION_LANGUAGE", /blackmail|extort|otherwise|შანტაჟ|გამოძალ|მუქარ/i],
  ["THREAT", /kill|hurt|harm|მოვკლავ|დაზიან|ვავნებ/i],
  ["SUSPICIOUS_LINK", /https?:\/\//i],
];

export function detectRiskSignals(description = "") {
  return signalRules.filter(([, pattern]) => pattern.test(description)).map(([type]) => type);
}

export function informationQuality(tip) {
  let score = 0;
  if (tip.firstHand) score += 2;
  if (tip.occurredAt) score += 2;
  if (tip.locationText) score += 1;
  if (tip.municipality) score += 1;
  if (tip.hasAttachment) score += 1;
  if (tip.reporterContact) score += 1;
  if ((tip.description || "").trim().length > 45) score += 1;
  return score >= 7 ? "HIGH_INFORMATION_QUALITY" : score >= 4 ? "NEEDS_FOLLOW_UP" : "LOW_INFORMATION";
}
