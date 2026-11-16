import { describe, expect, it } from 'vitest'
import { bioHasKeyword } from './keywords'

describe('bioHasKeyword', () => {
  it('matches whole words, so a short keyword like AI is safe to use', () => {
    expect(bioHasKeyword('AI & Data @pingidentity', ['AI'])).toBe(true)
    expect(bioHasKeyword('Building in #AI and robots', ['ai'])).toBe(true)
    expect(bioHasKeyword('Living in Thailand, email me', ['AI'])).toBe(false)
    expect(bioHasKeyword('I said hello', ['ai'])).toBe(false)
  })

  it('takes a plural for the singular, also inside a phrase', () => {
    expect(bioHasKeyword('Building production workflows & agents with Claude Code', ['agent'])).toBe(true)
    expect(bioHasKeyword('We ship AI agents for clinics', ['AI agent'])).toBe(true)
    expect(bioHasKeyword('Fine-tuning LLMs at night', ['LLM'])).toBe(true)
  })

  it('does not take a different longer word for the keyword', () => {
    expect(bioHasKeyword('Robotics engineer', ['robot'])).toBe(false)
    expect(bioHasKeyword('Agentic workflows', ['agent'])).toBe(false)
  })

  it('reads Vietnamese and other accented text as words too', () => {
    expect(bioHasKeyword('Kỹ sư AI ở Hà Nội', ['AI'])).toBe(true)
    expect(bioHasKeyword('Xây dựng robot cho nhà máy', ['robot'])).toBe(true)
  })
})
