// USD per million tokens, input and output. One USD per million tokens is one micro-USD per token, so cost = tokens x price.
// A model without a line here is recorded with its tokens, cost 0 and priced = false, and the screens say "no price yet" instead of a dollar figure.
// gpt-6 lines: OpenAI pricing page, 15 Nov 2026. deepseek-chat and gpt-5 lines are not checked against a page.
const PRICES: { prefix: string; inputPerM: number; outputPerM: number }[] = [
  { prefix: 'deepseek-chat', inputPerM: 0.27, outputPerM: 1.1 },
  { prefix: 'gpt-5-nano', inputPerM: 0.05, outputPerM: 0.4 },
  { prefix: 'gpt-5-mini', inputPerM: 0.25, outputPerM: 2 },
  { prefix: 'gpt-5', inputPerM: 1.25, outputPerM: 10 },
  { prefix: 'gpt-6-luna', inputPerM: 0.1, outputPerM: 0.5 },
  { prefix: 'gpt-6.1-terra', inputPerM: 1, outputPerM: 5 },
  { prefix: 'gpt-6.1-sol', inputPerM: 2, outputPerM: 10 },
  { prefix: 'gpt-6-astra', inputPerM: 10, outputPerM: 50 },
]

export function priceLine(model: string) {
  return PRICES.filter((p) => model.startsWith(p.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0] ?? null
}

export function priceMicros(model: string, inputTokens: number, outputTokens: number): number | null {
  const line = priceLine(model)
  return line ? Math.round(inputTokens * line.inputPerM + outputTokens * line.outputPerM) : null
}
