export interface ImpactEvidenceSource {
  title: string;
  tagline: string;
  description: string;
}

export interface ImpactExtraction {
  socialPotential: {
    severity: number | null;
    directness: number | null;
    inclusion: number | null;
    confidence: number;
    summary: string;
    evidenceQuote: string;
  };
  demonstratedImpact: {
    stage: number;
    confidence: number;
    summary: string;
    evidenceQuote: string;
  };
}

export interface ClassifiedImpact {
  socialPotential: {
    score: number | null;
    confidence: number;
    summary: string;
    evidenceQuote: string | null;
    factors: { severity: number | null; directness: number | null; inclusion: number | null };
  };
  demonstratedImpact: {
    score: number;
    confidence: number;
    summary: string;
    evidenceQuote: string | null;
    stage: 0 | 1 | 2 | 3;
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const round = (value: number) => Number(value.toFixed(3));

/** Convert extracted evidence into bounded map coordinates; this does no model inference. */
export function classifyImpact(extraction: ImpactExtraction, source: ImpactEvidenceSource): ClassifiedImpact {
  const social = extraction.socialPotential;
  const validQuote = (quote: string) => Boolean(quote) && [source.title, source.tagline, source.description].some((text) => text.includes(quote));
  const quoteValid = validQuote(social.evidenceQuote);
  const socialFactors = {
    severity: quoteValid && social.severity !== null ? clamp(social.severity, 0, 4) : null,
    directness: quoteValid && social.directness !== null ? clamp(social.directness, 0, 4) : null,
    inclusion: quoteValid && social.inclusion !== null ? clamp(social.inclusion, 0, 4) : null,
  };
  const weighted = (socialFactors.severity ?? 0) * 0.5 + (socialFactors.directness ?? 0) * 0.3 + (socialFactors.inclusion ?? 0) * 0.2;
  const coverage = [socialFactors.severity, socialFactors.directness, socialFactors.inclusion].filter((value) => value !== null).length / 3;

  const demonstrated = extraction.demonstratedImpact;
  const demonstratedQuoteValid = validQuote(demonstrated.evidenceQuote);
  const rawStage = demonstratedQuoteValid ? Math.trunc(clamp(demonstrated.stage, 0, 3)) : 0;
  const stage = demonstratedStage(rawStage, demonstrated.evidenceQuote, source);

  return {
    socialPotential: {
      score: coverage > 0 ? round(weighted / 4) : null,
      confidence: round(clamp(social.confidence, 0, 1) * coverage),
      summary: quoteValid ? social.summary : "No verifiable quote supports a social-potential rating in the supplied text.",
      evidenceQuote: quoteValid ? social.evidenceQuote : null,
      factors: socialFactors,
    },
    demonstratedImpact: {
      score: round(stage / 4),
      confidence: stage === 0 ? 0 : round(clamp(demonstrated.confidence, 0, 1)),
      summary: demonstratedQuoteValid
        ? stage < rawStage
          ? /\b(?:we ourselves|ourselves|our team|team members?|the team itself)\b/i.test(demonstrated.evidenceQuote)
            ? "The project authors describe their own team's observation; no external beneficiary outcome is evidenced."
            : "The evidence describes use or testing, without a reported change for external beneficiaries."
          : demonstrated.summary
        : "No verifiable outcome evidence was supplied.",
      evidenceQuote: demonstratedQuoteValid ? demonstrated.evidenceQuote : null,
      stage,
    },
  };
}

function demonstratedStage(stage: number, quote: string, source: ImpactEvidenceSource): 0 | 1 | 2 | 3 {
  if (stage < 2) return stage as 0 | 1;
  const text = quote.toLowerCase();
  const selfOnly = /\b(?:we ourselves|ourselves|our team|team members?|the team itself)\b/.test(text);
  const externalBeneficiary = /\b(?:users?|participants?|beneficiaries|customers?|patients?|students?|teachers?|tenants?|renters?|visitors?|community members?|residents?|clients?|families|households|people)\b/.test(text)
    && /\b(?:used|tested|helped|served|supported|reported|experienced|received|tried|participated|benefited|improved|reduced|increased|achieved|gained|learned)\b/.test(text);
  if (!selfOnly && externalBeneficiary) {
    if (stage === 3 && /\b(?:improved|reduced|increased|achieved|gained|learned|benefited|changed)\b/.test(text)) return 3;
    return 2;
  }
  const allText = `${source.title} ${source.tagline} ${source.description}`.toLowerCase();
  return /\b(?:prototype|pilot|tested|testing|playthrough|trial|demo|demonstration)\b/.test(allText) ? 1 : 0;
}
