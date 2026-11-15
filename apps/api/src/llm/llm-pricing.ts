// USD per million tokens, input and output. One USD per million tokens is one micro-USD per token, so cost = tokens x price.
// A model without a line here is recorded with its tokens and cost 0, never a guessed price. Check the figures against the vendor price page before a paid run.
const PRICES: { prefix: string; inputPerM: number; outputPerM: number }[] = [
  { prefix: 'deepseek-chat', inputPerM: 0.27, outputPerM: 1.1 },
  { prefix: 'gpt-5-nano', inputPerM: 0.05, outputPerM: 0.4 },
  { prefix: 'gpt-5-mini', inputPerM: 0.25, outputPerM: 2 },
  { prefix: 'gpt-5', inputPerM: 1.25, outputPerM: 10 },
]

export function priceLine(model: string) {
  return PRICES.filter((p) => model.startsWith(p.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null
}

export function priceMicros(model: string, inputTokens: number, outputTokens: number): number | null {
  const line = priceLine(model)
  return line ? Math.round(inputTokens * line.inputPerM + outputTokens * line.outputPerM) : null
}
