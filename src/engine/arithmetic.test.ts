import { describe, expect, it } from 'vitest'
import { combine, createPuzzle, initialCards, makeDeck, operate, resetAttempt, solveHand, submitAttempt, undo, type Difficulty, type Puzzle } from './arithmetic'

describe('arithmetic puzzle engine', () => {
  it('uses exact positive integer arithmetic', () => {
    expect(operate(8, 2, '÷')).toBe(4)
    expect(operate(8, 3, '÷')).toBeNull()
    expect(operate(2, 8, '-')).toBeNull()
    expect(operate(9, 8, '×')).toBe(72)
  })

  it('finds targets using subsets and parentheses', () => {
    const values = solveHand([9, 8, 7, 6, 5])
    expect(values.get(9 * (8 + 7))?.minimumCards).toBeLessThanOrEqual(3)
    expect(values.get(234)?.minimumCards).toBeGreaterThanOrEqual(3)
  })

  it('builds a 48-card deck without aces and values all face cards at ten', () => {
    const deck = makeDeck()
    expect(deck).toHaveLength(48)
    expect(new Set(deck.map(card => card.code)).size).toBe(48)
    expect(deck.every(card => card.rank !== 'A')).toBe(true)
    expect(deck.filter(card => ['J', 'Q', 'K'].includes(card.rank)).every(card => card.value === 10)).toBe(true)
  })

  it('generates exact targets at the required digit and card difficulty', () => {
    for (const difficulty of [3, 4, 5] as Difficulty[]) {
      const puzzle = createPuzzle(difficulty)
      expect(String(puzzle.target)).toHaveLength(difficulty)
      expect(solveHand(puzzle.hand.map(card => card.value)).get(puzzle.target)?.minimumCards).toBe(puzzle.minimumCards)
      expect(new Set(puzzle.hand.map(card => card.code)).size).toBe(puzzle.hand.length)
      expect(puzzle.solution).toBeTruthy()
    }
  })

  it('combines cards once, supports undo, and scores an attempt', () => {
    const deck = makeDeck()
    const hand = ['S9', 'S8', 'S7', 'S6', 'S5'].map(code => deck.find(card => card.code === code)!)
    const puzzle: Puzzle = { id: crypto.randomUUID(), difficulty: 3, hand, target: 234, minimumCards: 3, reachableTargets: 1, solution: '', cards: initialCards(hand), moves: [], attempts: [], maxAttempts: 5, nextId: 5, startedAt: Date.now(), status: 'playing' }
    const next = combine(puzzle, 0, 1, '×').puzzle
    expect(next.cards).toHaveLength(4)
    expect(next.cards.at(-1)?.value).toBe(72)
    expect(undo(next).cards).toEqual(puzzle.cards)
    expect(submitAttempt(next).attempts[0].value).toBe(72)
    expect(resetAttempt(next).cards).toEqual(puzzle.cards)
  })
})
