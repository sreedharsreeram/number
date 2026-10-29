import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { ArrowLeft, ArrowRight, BarChart2, Check, CircleHelp, Lightbulb, LockKeyhole, RotateCcw, Shuffle, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { combine, createPuzzle, resetAttempt, submitAttempt, undo, type Difficulty, type Operator, type Puzzle } from '@/engine/arithmetic'
import { accountFromUser, loadResults, saveResult, supabase, type Account, type PracticeResult } from '@/lib/supabase'
import './App.css'

const STORAGE_KEY = 'deckle-arithmetic-v3'
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

function loadPuzzle(): Puzzle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Puzzle
      if (
        [3, 4, 5].includes(saved.difficulty) &&
        Number.isInteger(saved.target) &&
        Array.isArray(saved.hand) && saved.hand.length >= 5 &&
        saved.hand.every(card => card && typeof card.rank === 'string' && typeof card.suit === 'string' && Number.isInteger(card.value)) &&
        Array.isArray(saved.cards) && saved.cards.every(card => card && Number.isInteger(card.value) && Array.isArray(card.used)) &&
        Array.isArray(saved.moves) && Array.isArray(saved.attempts) &&
        ['playing', 'won', 'lost'].includes(saved.status)
      ) return saved
    }
  } catch { /* A fresh puzzle works without browser storage. */ }
  return createPuzzle(3)
}

function AuthDialog({ open, onOpenChange, onAuthed }: { open: boolean; onOpenChange: (value: boolean) => void; onAuthed: (account: Account) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | undefined>()
  const turnstile = useRef<TurnstileInstance>(undefined)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    if (turnstileSiteKey && !captchaToken) { setMessage('Complete the security check first.'); return }
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() }, captchaToken } })
        if (error) throw error
        const account = accountFromUser(data.session?.user ?? null)
        if (account) { onAuthed(account); onOpenChange(false); toast.success('Account created.') }
        else { setMode('login'); setMessage('Check your email to confirm your account, then sign in.') }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        if (error) throw error
        const account = accountFromUser(data.user)
        if (account) onAuthed(account)
        onOpenChange(false)
        toast.success('Signed in.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not sign in.') }
    finally { setBusy(false); setCaptchaToken(undefined); turnstile.current?.reset() }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="dialog-shell sm:max-w-[390px]"><DialogHeader><DialogTitle>{mode === 'register' ? 'Create an account' : 'Sign in'}</DialogTitle><DialogDescription>Save your practice and pick up where you left off.</DialogDescription></DialogHeader>{!supabase ? <p className="dialog-message">Accounts need a Supabase project. Guest practice is ready now.</p> : <form className="auth-form" onSubmit={submit}>{mode === 'register' && <div><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={40} autoComplete="name" required /></div>}<div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></div><div><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={6} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /></div>{turnstileSiteKey && <Turnstile ref={turnstile} siteKey={turnstileSiteKey} onSuccess={setCaptchaToken} onExpire={() => setCaptchaToken(undefined)} options={{ size: 'flexible' }} />}{message && <p className="dialog-message" role="alert">{message}</p>}<Button type="submit" disabled={busy} className="dark-button">{busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'} <ArrowRight size={15} /></Button><button type="button" className="switch-link" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage('') }}>{mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form>}</DialogContent></Dialog>
}

function App() {
  const reducedMotion = useReducedMotion()
  const [puzzle, setPuzzle] = useState<Puzzle>(loadPuzzle)
  const [selected, setSelected] = useState<number[]>([])
  const [quantOpen, setQuantOpen] = useState(false)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [results, setResults] = useState<PracticeResult[]>([])
  const bestCard = useMemo(() => [...puzzle.cards].sort((a, b) => Math.abs(a.value - puzzle.target) - Math.abs(b.value - puzzle.target))[0], [puzzle.cards, puzzle.target])
  const triesUsed = puzzle.attempts.length + (puzzle.status === 'won' ? 1 : 0)
  const wins = results.filter(result => result.won).length

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(puzzle)) } catch { /* Guest practice remains playable. */ } }, [puzzle])
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setAccount(accountFromUser(data.user)))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(accountFromUser(session?.user ?? null))
      if (!session) setResults([])
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!account) return
    loadResults().then(setResults).catch(() => toast.error('Could not load practice history.'))
  }, [account])
  useEffect(() => {
    if (!account || puzzle.status === 'playing') return
    saveResult({ id: puzzle.id, user_id: account.id, difficulty: puzzle.difficulty, won: puzzle.status === 'won', guesses: triesUsed, duration_ms: Math.max(0, Date.now() - puzzle.startedAt) })
      .then(() => loadResults().then(setResults))
      .catch(() => toast.error('Could not save this result.'))
  }, [account, puzzle.id, puzzle.status, puzzle.difficulty, puzzle.startedAt, triesUsed])

  function newPuzzle(difficulty: Difficulty = puzzle.difficulty) {
    setPuzzle(createPuzzle(difficulty))
    setSelected([])
    setQuantOpen(false)
    setSolutionOpen(false)
  }

  function selectCard(id: number) {
    if (puzzle.status !== 'playing') return
    setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < 2 ? [...previous, id] : [id])
  }

  function play(operator: Operator) {
    if (selected.length !== 2) { toast.message('Choose two cards first.'); return }
    const result = combine(puzzle, selected[0], selected[1], operator)
    if (result.error) { toast.message(result.error); return }
    setPuzzle(result.puzzle)
    setSelected([])
  }

  function bank() {
    if (!puzzle.moves.length) return
    setPuzzle(submitAttempt(puzzle))
    setSelected([])
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (authOpen || helpOpen || statsOpen || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return
      if (/^[1-6]$/.test(event.key)) { const card = puzzle.cards[Number(event.key) - 1]; if (card) selectCard(card.id) }
      else if (event.key === '+' || event.key === '-') play(event.key as Operator)
      else if (event.key === '*' || event.key.toLowerCase() === 'x') play('×')
      else if (event.key === '/') { event.preventDefault(); play('÷') }
      else if (event.key === 'Backspace') { setPuzzle(current => undo(current)); setSelected([]) }
      else if (event.key === 'Escape') setSelected([])
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  async function signOut() { await supabase?.auth.signOut(); setAccount(null); setResults([]); setStatsOpen(false) }

  return <div className="app"><header className="topbar"><div className="topbar-inner"><button className="wordmark" onClick={() => newPuzzle(3)}>deckle<span>.</span></button><div className="topbar-right"><button aria-label="How to play" onClick={() => setHelpOpen(true)}><CircleHelp size={20} /></button><button aria-label="Statistics" onClick={() => setStatsOpen(true)}><BarChart2 size={20} /></button><button className="account-link" onClick={() => account ? setStatsOpen(true) : setAuthOpen(true)}><UserRound size={18} /><span>{account ? account.name : 'Sign in'}</span></button></div></div></header>
    <main className="main"><div className="mode-row"><span className="mode-label">practice</span><div className="mode-tabs" role="group" aria-label="Target size">{([3, 4, 5] as const).map(difficulty => <button key={difficulty} className={puzzle.difficulty === difficulty ? 'active' : ''} aria-pressed={puzzle.difficulty === difficulty} onClick={() => difficulty !== puzzle.difficulty && newPuzzle(difficulty)}>{difficulty} digits</button>)}</div></div>
      <section className="puzzle-head"><p className="small-label">make this number</p><h1>{puzzle.target}</h1><div className="attempt-dots" aria-label={`${triesUsed} of ${puzzle.maxAttempts} attempts used`}>{Array.from({ length: puzzle.maxAttempts }, (_, i) => <span key={i} className={i < triesUsed ? puzzle.status === 'won' && i === triesUsed - 1 ? 'win' : 'used' : ''} />)}</div><p className="target-subtitle">Combine your cards. Use each one at most once.</p></section>
      <section className="board" aria-label="Arithmetic puzzle"><div className="board-top"><span>your hand</span><button onClick={() => newPuzzle()}><Shuffle size={14} /> new deal</button></div><div className={`cards deal-${puzzle.hand.length}`}>{puzzle.cards.map((card, index) => <motion.button key={`${puzzle.id}-${card.id}`} className={`number-card ${selected.includes(card.id) ? 'selected' : ''} ${card.used.length > 1 ? 'derived' : 'printed'}`} onClick={() => selectCard(card.id)} initial={reducedMotion ? false : card.deckCode ? { x: -190, y: -65, rotate: -18, scale: .76, opacity: 0 } : { y: -12, scale: .8, opacity: 0 }} animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }} transition={{ delay: reducedMotion ? 0 : card.deckCode ? index * .12 : 0, type: 'spring', stiffness: 270, damping: 22 }} whileTap={reducedMotion ? undefined : { scale: .96 }} aria-pressed={selected.includes(card.id)} aria-label={`Card ${index + 1}: ${card.rank ? `${card.rank} of ${card.suit === 'S' ? 'spades' : card.suit === 'H' ? 'hearts' : card.suit === 'D' ? 'diamonds' : 'clubs'}, worth ${card.value}` : card.value}${selected.includes(card.id) ? ', selected' : ''}`}>{card.rank && card.suit ? <img className="playing-art" src={`/cards/${card.suit}-${card.rank}.svg`} alt="" draggable="false" /> : <><span className="card-index">{index + 1}</span><strong>{card.value}</strong><span className="card-trace">{card.used.length} cards</span></>}</motion.button>)}</div><p className="deck-note">48-card deck · no aces · J, Q, K are worth 10</p><div className="selection-line">{selected.length === 0 ? <span>choose two cards, then an operation</span> : <><span className="selected-value">{puzzle.cards.find(card => card.id === selected[0])?.value}</span><span className="selection-operator">{selected.length === 2 ? 'and' : 'then'}</span>{selected.length === 2 && <span className="selected-value">{puzzle.cards.find(card => card.id === selected[1])?.value}</span>}</>}</div><div className="operations" role="group" aria-label="Operations">{(['+', '-', '×', '÷'] as Operator[]).map(operator => <button key={operator} disabled={selected.length !== 2 || puzzle.status !== 'playing'} onClick={() => play(operator)} aria-label={`Use ${operator}`}>{operator}</button>)}</div><div className="board-actions"><button onClick={() => { setPuzzle(current => undo(current)); setSelected([]) }} disabled={!puzzle.moves.length || puzzle.status !== 'playing'}><ArrowLeft size={15} /> undo</button><button onClick={() => { setPuzzle(current => resetAttempt(current)); setSelected([]) }} disabled={!puzzle.moves.length || puzzle.status !== 'playing'}><RotateCcw size={15} /> reset</button><Button className="submit-button" onClick={bank} disabled={!puzzle.moves.length || puzzle.status !== 'playing'}>submit {bestCard?.value ?? 'result'} <ArrowRight size={16} /></Button></div></section>
      {puzzle.status !== 'playing' && <div className={`end-state ${puzzle.status}`}><div><strong>{puzzle.status === 'won' ? 'Exactly right.' : 'Out of attempts.'}</strong><p>{puzzle.status === 'won' ? `${puzzle.target} in ${triesUsed} ${triesUsed === 1 ? 'try' : 'tries'}. Nice work.` : `One solution: ${puzzle.solution}`}</p></div><Button onClick={() => newPuzzle()}>Play again <ArrowRight size={15} /></Button></div>}
      {puzzle.moves.length > 0 && <div className="workings"><span className="small-label">YOUR WORK</span>{puzzle.cards.filter(card => card.used.length > 1).map(card => <p key={card.id}>{card.expression} = <b>{card.value}</b></p>)}</div>}
      {puzzle.attempts.length > 0 && <div className="past-attempts"><span className="small-label">PAST TRIES</span>{puzzle.attempts.map((attempt, i) => <div key={i}><span>{String(i + 1).padStart(2, '0')}</span><strong>{attempt.value}</strong><span>{attempt.distance} away</span></div>)}</div>}
      <div className="quant-section"><button className="quant-toggle" onClick={() => setQuantOpen(!quantOpen)}><Lightbulb size={17} /> Quant mode <span>{quantOpen ? '−' : '+'}</span></button>{quantOpen && <div className="quant-content"><div><strong>{puzzle.minimumCards}</strong><span>fewest cards needed</span></div><div><strong>{puzzle.reachableTargets.toLocaleString()}</strong><span>{puzzle.difficulty}-digit numbers reachable</span></div><p>Exhaustive search checks every card subset and every valid arithmetic tree. Division must be exact; intermediate values stay positive integers.</p><button className="solution-link" onClick={() => setSolutionOpen(!solutionOpen)}>{solutionOpen ? 'Hide' : 'Reveal'} one solution <ArrowRight size={14} /></button>{solutionOpen && <code>{puzzle.solution} = {puzzle.target}</code>}</div>}</div>
      <p className="keyboard-note">Keyboard: number keys select cards · + − × ÷ combine · backspace undoes</p>
    </main>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="dialog-shell sm:max-w-[450px]"><DialogHeader><DialogTitle>How to play</DialogTitle><DialogDescription>Make the target from your hand.</DialogDescription></DialogHeader><div className="help-copy"><p><b>1.</b> Select two cards in order.</p><p><b>2.</b> Choose +, −, ×, or ÷. The result becomes a new card. You can use it again.</p><p><b>3.</b> Reach the target exactly to win. Submit your closest result to spend a try and reset the hand.</p><p>Cards come from a 52-card deck without aces. J, Q, and K are worth 10. Each card can appear once in a calculation. Division must be exact and every intermediate result must be a positive whole number.</p></div><Button className="dark-button" onClick={() => setHelpOpen(false)}>Got it <Check size={15} /></Button></DialogContent></Dialog>
    <Dialog open={statsOpen} onOpenChange={setStatsOpen}><DialogContent className="dialog-shell sm:max-w-[430px]"><DialogHeader><DialogTitle>Practice stats</DialogTitle><DialogDescription>{account ? `Signed in as ${account.name}` : 'Sign in to save your practice.'}</DialogDescription></DialogHeader>{account ? <><div className="stats-numbers"><div><strong>{results.length}</strong><span>Played</span></div><div><strong>{wins}</strong><span>Solved</span></div><div><strong>{results.length ? Math.round(wins / results.length * 100) : 0}%</strong><span>Win rate</span></div></div><button className="switch-link" onClick={signOut}>Sign out</button></> : <Button className="dark-button" onClick={() => { setStatsOpen(false); setAuthOpen(true) }}><LockKeyhole size={15} /> Create an account</Button>}</DialogContent></Dialog>
    <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onAuthed={setAccount} />
    <Toaster position="top-center" richColors />
  </div>
}

export default App
