export type Difficulty = 3 | 4 | 5
export type Operator = '+' | '-' | '×' | '÷'
export type Suit = 'S' | 'H' | 'D' | 'C'
export type DeckCard = { code: string; rank: string; suit: Suit; value: number }
export type NumberCard = { id: number; value: number; expression: string; used: number[]; deckCode?: string; rank?: string; suit?: Suit }
export type Attempt = { value: number; expression: string; distance: number }
export type Puzzle = {
  id: string
  difficulty: Difficulty
  hand: DeckCard[]
  target: number
  minimumCards: number
  reachableTargets: number
  solution: string
  cards: NumberCard[]
  moves: NumberCard[][]
  attempts: Attempt[]
  maxAttempts: number
  nextId: number
  startedAt: number
  status: 'playing' | 'won' | 'lost'
}

export const levels: Record<Difficulty, { name: string; handSize: number; minimumCards: number; maxAttempts: number }> = {
  3: { name: 'Easy', handSize: 5, minimumCards: 3, maxAttempts: 5 },
  4: { name: 'Medium', handSize: 5, minimumCards: 4, maxAttempts: 5 },
  5: { name: 'Hard', handSize: 6, minimumCards: 5, maxAttempts: 6 },
}

type Witness = { expression: string; operators: number }
export type Reachable = { minimumCards: number; expression: string; operators: number }
const MAX_VALUE = 100_000_000
const OP_PLUS = 1
const OP_MINUS = 2
const OP_TIMES = 4
const OP_DIVIDE = 8

function bits(mask: number): number {
  let count = 0
  while (mask) { count += mask & 1; mask >>= 1 }
  return count
}

function quality(witness: Witness): number {
  const ops = witness.operators
  return Number(Boolean(ops & (OP_PLUS | OP_MINUS))) + Number(Boolean(ops & (OP_TIMES | OP_DIVIDE))) + bits(ops)
}

/** Exhaustive subset dynamic programming over positive integer intermediates. */
export function solveHand(hand: number[]): Map<number, Reachable> {
  const size = 1 << hand.length
  const dp: Map<number, Witness>[] = Array.from({ length: size }, () => new Map())
  const reachable = new Map<number, Reachable>()
  for (let i = 0; i < hand.length; i++) dp[1 << i].set(hand[i], { expression: String(hand[i]), operators: 0 })

  for (let mask = 1; mask < size; mask++) {
    const cardCount = bits(mask)
    if (cardCount > 1) {
      for (let leftMask = (mask - 1) & mask; leftMask; leftMask = (leftMask - 1) & mask) {
        const rightMask = mask ^ leftMask
        if (leftMask > rightMask) continue // One partition, with both noncommutative directions below.
        for (const [a, wa] of dp[leftMask]) for (const [b, wb] of dp[rightMask]) {
          const combinedOps = wa.operators | wb.operators
          const put = (value: number, operator: Operator, operatorBit: number, first = wa, second = wb) => {
            if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_VALUE) return
            const witness = { expression: `(${first.expression}${operator}${second.expression})`, operators: combinedOps | operatorBit }
            const previous = dp[mask].get(value)
            if (!previous || quality(witness) > quality(previous)) dp[mask].set(value, witness)
          }
          put(a + b, '+', OP_PLUS)
          put(a * b, '×', OP_TIMES)
          if (a > b) put(a - b, '-', OP_MINUS)
          if (b > a) put(b - a, '-', OP_MINUS, wb, wa)
          if (b !== 0 && a % b === 0) put(a / b, '÷', OP_DIVIDE)
          if (a !== 0 && b % a === 0) put(b / a, '÷', OP_DIVIDE, wb, wa)
        }
      }
    }
    for (const [value, witness] of dp[mask]) {
      const prior = reachable.get(value)
      if (!prior || cardCount < prior.minimumCards || (cardCount === prior.minimumCards && quality(witness) > quality(prior))) {
        reachable.set(value, { minimumCards: cardCount, ...witness })
      }
    }
  }
  return reachable
}

function randomInt(max: number): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

function shuffled<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function makeDeck(): DeckCard[] {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const suits: Suit[] = ['S', 'H', 'D', 'C']
  return suits.flatMap(suit => ranks.map(rank => ({
    code: `${suit}${rank.toLowerCase()}`,
    rank, suit,
    value: ['10', 'J', 'Q', 'K'].includes(rank) ? 10 : Number(rank),
  })))
}

export function initialCards(hand: DeckCard[]): NumberCard[] {
  return hand.map((card, id) => ({ id, value: card.value, expression: String(card.value), used: [id], deckCode: card.code, rank: card.rank, suit: card.suit }))
}

export function createPuzzle(difficulty: Difficulty): Puzzle {
  const level = levels[difficulty]
  const lower = 10 ** (difficulty - 1)
  const upper = 10 ** difficulty - 1
  let chosen: { hand: DeckCard[]; target: number; reachable: Map<number, Reachable> } | undefined

  // Each puzzle is checked against *all* legal arithmetic trees. A target is
  // accepted only if it needs the specified minimum number of cards.
  for (let deal = 0; deal < 18 && !chosen; deal++) {
    const deck = makeDeck()
    const tens = shuffled(deck.filter(card => card.value === 10))
    const numbers = shuffled(deck.filter(card => card.value < 10))
    const tenCount = difficulty === 3 ? 1 : difficulty === 4 ? 2 : 3
    const hand = shuffled([...tens.slice(0, tenCount), ...numbers.slice(0, level.handSize - tenCount)])
    const reachable = solveHand(hand.map(card => card.value))
    const targets = [...reachable].filter(([value, proof]) =>
      value >= lower && value <= upper && proof.minimumCards === level.minimumCards &&
      Boolean(proof.operators & (OP_PLUS | OP_MINUS)) && Boolean(proof.operators & (OP_TIMES | OP_DIVIDE)),
    )
    if (targets.length) chosen = { hand, target: targets[randomInt(targets.length)][0], reachable }
  }
  if (!chosen) throw new Error('Could not generate a solvable puzzle')
  const proof = chosen.reachable.get(chosen.target)!
  return {
    id: crypto.randomUUID(), difficulty, hand: chosen.hand, target: chosen.target,
    minimumCards: proof.minimumCards,
    reachableTargets: [...chosen.reachable.keys()].filter(value => value >= lower && value <= upper).length,
    solution: proof.expression,
    cards: initialCards(chosen.hand), moves: [], attempts: [], maxAttempts: level.maxAttempts,
    nextId: chosen.hand.length, startedAt: Date.now(), status: 'playing',
  }
}

export function operate(a: number, b: number, operator: Operator): number | null {
  const value = operator === '+' ? a + b : operator === '-' ? a - b : operator === '×' ? a * b : b !== 0 && a % b === 0 ? a / b : NaN
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_VALUE ? value : null
}

export function combine(puzzle: Puzzle, firstId: number, secondId: number, operator: Operator): { puzzle: Puzzle; error?: string } {
  if (puzzle.status !== 'playing' || firstId === secondId) return { puzzle, error: 'Select two different cards.' }
  const first = puzzle.cards.find(card => card.id === firstId)
  const second = puzzle.cards.find(card => card.id === secondId)
  if (!first || !second) return { puzzle, error: 'Select two cards.' }
  const value = operate(first.value, second.value, operator)
  if (value === null) return { puzzle, error: operator === '÷' ? 'Division must produce a whole number.' : 'That move must produce a positive number.' }
  const expression = `(${first.expression} ${operator} ${second.expression})`
  const result: NumberCard = { id: puzzle.nextId, value, expression, used: [...first.used, ...second.used] }
  return {
    puzzle: {
      ...puzzle, cards: [...puzzle.cards.filter(card => card.id !== firstId && card.id !== secondId), result],
      moves: [...puzzle.moves, puzzle.cards], nextId: puzzle.nextId + 1,
      status: value === puzzle.target ? 'won' : 'playing',
    },
  }
}

export function undo(puzzle: Puzzle): Puzzle {
  if (puzzle.status !== 'playing' || !puzzle.moves.length) return puzzle
  return { ...puzzle, cards: puzzle.moves.at(-1)!, moves: puzzle.moves.slice(0, -1) }
}

export function resetAttempt(puzzle: Puzzle): Puzzle {
  if (puzzle.status !== 'playing') return puzzle
  return { ...puzzle, cards: initialCards(puzzle.hand), moves: [], nextId: puzzle.hand.length }
}

export function submitAttempt(puzzle: Puzzle): Puzzle {
  if (puzzle.status !== 'playing' || !puzzle.moves.length) return puzzle
  const best = [...puzzle.cards].sort((a, b) => Math.abs(a.value - puzzle.target) - Math.abs(b.value - puzzle.target))[0]
  const attempts = [...puzzle.attempts, { value: best.value, expression: best.expression, distance: Math.abs(best.value - puzzle.target) }]
  return { ...resetAttempt(puzzle), attempts, status: attempts.length >= puzzle.maxAttempts ? 'lost' : 'playing' }
}
