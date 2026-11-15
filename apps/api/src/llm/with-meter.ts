import { LlmClient, LlmMeter } from './llm-client'

// The same client, with every request labelled for the campaign and lane that pay for it.
export const withMeter = (llm: LlmClient, meter: LlmMeter): LlmClient => ({ completeJson: (req) => llm.completeJson({ meter, ...req }) })
