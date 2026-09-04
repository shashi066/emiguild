import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getTowerFloorPresentation,
  getTowerFocusedLevel,
  getTowerMiniCardPresentation,
  getTowerRedCardRevealDelay,
  getTowerScrollBehavior,
  getTowerScreen,
  isTowerSafeReplayStale,
  orderTowerFloors,
  shouldShowTowerAttemptExpiry,
  TOWER_RED_CARD_REVEAL_MS,
} from '../../lib/tower-view';

test('maps every Tower UI state deterministically', () => {
  const base = { enabled: true, availableTokens: 0 };
  assert.equal(getTowerScreen({ ...base, error: 'offline' }), 'error');
  assert.equal(getTowerScreen({ ...base, loading: true }), 'loading');
  assert.equal(getTowerScreen({ ...base, enabled: false }), 'disabled');
  assert.equal(getTowerScreen(base), 'no-ticket');
  assert.equal(getTowerScreen({ ...base, availableTokens: 1 }), 'ready');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'IN_PROGRESS' }), 'active');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'LOST' }), 'lost');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'COMPLETED' }), 'completed');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'CLAIMED' }), 'claimed');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'TIMED_OUT' }), 'timed-out');
  assert.equal(getTowerScreen({ ...base, attemptStatus: 'EXPIRED' }), 'expired');
  assert.equal(
    getTowerScreen({ ...base, attemptStatus: 'LOST', availableTokens: 1, loading: true }),
    'loading',
  );
});

test('orders the mobile tower top-down and focuses a safe floor until Climb', () => {
  assert.deepEqual(orderTowerFloors([{ level: 1 }, { level: 10 }, { level: 4 }]).map((floor) => floor.level), [10, 4, 1]);
  assert.equal(getTowerFocusedLevel({ attemptLevel: 5, attemptStatus: 'IN_PROGRESS', pendingSafeLevel: 4 }), 4);
  assert.equal(getTowerFocusedLevel({ attemptLevel: 5, attemptStatus: 'IN_PROGRESS' }), 5);
  assert.equal(getTowerFocusedLevel({ attemptLevel: 5, attemptStatus: 'CLAIMED', pendingSafeLevel: 4 }), 5);
});

test('ignores delayed safe responses after the player has committed upward', () => {
  const normalSafe = {
    result: 'SAFE' as const,
    requestedLevel: 1,
    latestResolvedLevel: 1,
    attemptStatus: 'IN_PROGRESS',
    attemptCanClaim: true,
  };
  assert.equal(isTowerSafeReplayStale(normalSafe), false);
  assert.equal(isTowerSafeReplayStale({ ...normalSafe, attemptCanClaim: false }), true);
  assert.equal(isTowerSafeReplayStale({ ...normalSafe, latestResolvedLevel: 2 }), true);
  assert.equal(isTowerSafeReplayStale({ ...normalSafe, attemptStatus: 'CLAIMED', attemptCanClaim: false }), true);
  assert.equal(isTowerSafeReplayStale({ ...normalSafe, result: 'LOSS' }), false);
  assert.equal(isTowerSafeReplayStale({
    ...normalSafe,
    requestedLevel: 10,
    latestResolvedLevel: 10,
    attemptStatus: 'COMPLETED',
  }), false);
});

test('classifies active, cleared, lost, and terminal Tower floors', () => {
  const active = { focusedLevel: 5, attemptStatus: 'IN_PROGRESS' };
  assert.equal(getTowerFloorPresentation({ ...active, level: 8 }), 'locked');
  assert.equal(getTowerFloorPresentation({ ...active, level: 5 }), 'current');
  assert.equal(getTowerFloorPresentation({ ...active, level: 4, historyResult: 'SAFE' }), 'cleared');
  assert.equal(getTowerFloorPresentation({ ...active, level: 4, historyResult: 'SAFE', pendingSafeLevel: 4 }), 'pending-safe');
  assert.equal(getTowerFloorPresentation({ ...active, level: 3, historyResult: 'LOSS' }), 'lost');
  assert.equal(getTowerFloorPresentation({ level: 4, focusedLevel: 5, attemptStatus: 'CLAIMED', historyResult: 'SAFE' }), 'cleared');
  assert.equal(getTowerFloorPresentation({ level: 3, focusedLevel: 5, attemptStatus: 'LOST', historyResult: 'LOSS' }), 'lost');
  assert.equal(getTowerFloorPresentation({ level: 10, focusedLevel: 3, attemptStatus: 'CLAIMED' }), 'revealed');
});

test('colors terminal history fully without revealing active red cards', () => {
  const terminalCards = Array.from({ length: 10 }, (_, level) => (
    [0, 1, 2].map((position) => getTowerMiniCardPresentation({
      position,
      redPosition: level % 3,
    }))
  )).flat();
  assert.equal(terminalCards.filter((card) => card === 'safe').length, 20);
  assert.equal(terminalCards.filter((card) => card === 'red').length, 10);
  assert.equal(terminalCards.filter((card) => card === 'neutral').length, 0);

  const activeCards = [0, 1, 2].map((position) => getTowerMiniCardPresentation({
    position,
    selectedPosition: 1,
    historyResult: 'SAFE',
  }));
  assert.deepEqual(activeCards, ['neutral', 'selected-safe', 'neutral']);

  const visitedTerminalCards = [0, 1, 2].map((position) => getTowerMiniCardPresentation({
    position,
    selectedPosition: 1,
    historyResult: 'SAFE',
    redPosition: 2,
  }));
  assert.deepEqual(visitedTerminalCards, ['safe', 'selected-safe', 'red']);

  const unvisitedTerminalCards = [0, 1, 2].map((position) => getTowerMiniCardPresentation({
    position,
    redPosition: 2,
  }));
  assert.deepEqual(unvisitedTerminalCards, ['safe', 'safe', 'red']);

  const losingTerminalCards = [0, 1, 2].map((position) => getTowerMiniCardPresentation({
    position,
    selectedPosition: 2,
    historyResult: 'LOSS',
    redPosition: 2,
  }));
  assert.deepEqual(losingTerminalCards, ['safe', 'safe', 'red']);
});

test('uses one local countdown interval without polling Tower state', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  assert.equal(source.match(/window\.setInterval/g)?.length, 1);
  assert.equal(source.match(/fetch\(endpoint/g)?.length, 1);
  assert.equal(source.includes('`/api/tower/current?attemptId=${encodeURIComponent(recoveryAttemptId)}`'), true);
  assert.equal(source.includes('refresh(activeAttemptId).catch'), true);
  assert.equal(source.includes('refresh(attempt.attemptId).catch'), true);
});

test('keeps booking check-in grants automatic without a redundant row action', () => {
  const source = readFileSync(new URL('../../app/admin/bookings/page.tsx', import.meta.url), 'utf8');
  const grantRoute = readFileSync(new URL('../../app/api/tower/grant-token/route.ts', import.meta.url), 'utf8');
  const adminGrantRoute = readFileSync(new URL('../../app/api/admin/tower/tokens/route.ts', import.meta.url), 'utf8');
  const adminSource = readFileSync(new URL('../../components/admin/AdminTower.tsx', import.meta.url), 'utf8');
  assert.equal(source.match(/\/api\/tower\/grant-token/g)?.length, 1);
  assert.equal(source.includes("newStatus === 'CHECKED_IN'"), true);
  assert.equal(source.includes('Grant one manually from Admin > Tower.'), true);
  assert.equal(source.includes('ensureTowerToken'), false);
  assert.equal(source.includes('tower-token-${b.id}'), false);
  assert.equal(source.includes('title="Ensure Tower Token"'), false);
  assert.equal(grantRoute.includes('token: {'), false);
  assert.equal(adminGrantRoute.includes('token: {'), false);
  assert.equal(adminGrantRoute.includes('tokens: result.tokens'), false);
  assert.equal(adminGrantRoute.includes("body?.quantity === undefined ? 1 : Number(body.quantity)"), true);
  assert.equal(adminGrantRoute.includes('createdCount: result.createdCount'), true);
  assert.equal(adminGrantRoute.includes('quantity: result.tokens.length'), true);
  assert.equal(source.includes('data?.token?.'), false);
  assert.equal(adminSource.includes('data.token.'), false);
});

test('grants an idempotent 1 to 10 token batch without clearing the selected tester', () => {
  const source = readFileSync(new URL('../../components/admin/AdminTower.tsx', import.meta.url), 'utf8');
  const grantStart = source.indexOf('const grant = async () =>');
  const grantEnd = source.indexOf('\n\n  return (', grantStart);
  const grantSource = source.slice(grantStart, grantEnd);

  assert.equal(source.includes("useState('1')"), true);
  assert.equal(source.includes('requestedGrantQuantity >= 1'), true);
  assert.equal(source.includes('requestedGrantQuantity <= 10'), true);
  assert.equal(source.includes('id="tower-token-quantity"'), true);
  assert.equal(source.includes('Number of Tokens'), true);
  assert.equal(source.includes('min={1} max={10} step={1}'), true);
  assert.equal(source.includes('!selectedUser || !grantQuantityValid || grantBusy'), true);
  assert.equal(grantSource.includes('quantity: requestedGrantQuantity'), true);
  assert.equal(grantSource.includes('requestIdRef.current = newRequestId();'), true);
  assert.equal(grantSource.includes('setSelectedUser(null)'), false);
  assert.equal(grantSource.includes("setQuery('')"), false);
  assert.equal(source.includes("`Grant ${requestedGrantQuantity} Token${requestedGrantQuantity === 1 ? '' : 's'}`"), true);
  assert.equal(source.includes('This ${grantedQuantity}-token grant was already stored'), true);
});

test('confirms one promotional token for every user through an idempotent private route', () => {
  const source = readFileSync(new URL('../../components/admin/AdminTower.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../../app/api/admin/tower/tokens/promotion/route.ts', import.meta.url), 'utf8');
  const tower = readFileSync(new URL('../../lib/tower.ts', import.meta.url), 'utf8');

  assert.equal(route.includes('export async function GET()'), true);
  assert.equal(route.includes('export async function POST(req: NextRequest)'), true);
  assert.equal(route.includes("session.user.role !== 'ADMIN'"), true);
  assert.equal(route.includes('tokens:'), false);
  assert.equal(route.includes('sourceRefId'), false);
  assert.equal(route.includes('recipientCount: result.recipientCount'), true);
  assert.equal(tower.includes("source: 'PROMOTION'"), true);
  assert.equal(tower.includes("where: { role: 'USER' }"), true);
  assert.equal(tower.includes('tx.towerToken.createMany'), true);
  assert.equal(source.match(/\/api\/admin\/tower\/tokens\/promotion/g)?.length, 2);
  assert.equal(source.includes('Grant to All Users'), true);
  assert.equal(source.includes('Grant one token to every user?'), true);
  assert.equal(source.includes('Tokens they already have will remain available.'), true);
  assert.equal(source.includes('disabled={!enabled || grantBusy}'), true);
  assert.equal(source.includes('promotionRequestIdRef.current = newRequestId();'), true);
  assert.equal(source.includes("if (item.source === 'PROMOTION') return `Promotion${grantor}`"), true);
  assert.equal(source.includes('.tower-promotion-actions { display: grid; grid-template-columns:'), true);
});

test('keeps the Admin Tower editor readable and compact on mobile', () => {
  const source = readFileSync(new URL('../../components/admin/AdminTower.tsx', import.meta.url), 'utf8');
  const rewardEditorStart = source.indexOf("{activeEditor === 'rewards' && (");
  const rewardEditorEnd = source.indexOf("{view === 'history' && (", rewardEditorStart);
  const rewardEditorSource = source.slice(rewardEditorStart, rewardEditorEnd);

  assert.equal(source.includes('className="search-leading-icon"'), true);
  assert.equal(source.includes('.tower-user-results { position: absolute; z-index: 3; top: calc(100% + 4px)'), true);
  assert.equal(source.includes('<TowerSummaryCard title="Tower Availability"'), true);
  assert.equal(source.includes('<TowerSummaryCard title="Climb Timer"'), true);
  assert.equal(source.includes('<TowerSummaryCard title="Floor Rewards"'), true);
  assert.equal(source.includes("{activeEditor === 'availability' && ("), true);
  assert.equal(source.includes("{activeEditor === 'timer' && ("), true);
  assert.equal(source.includes("{activeEditor === 'rewards' && ("), true);
  assert.equal(source.includes('TOWER_RUN_DURATION_OPTIONS_SECONDS.map((seconds)'), true);
  assert.equal(source.includes('aria-pressed={timerDraft === seconds}'), true);
  assert.equal(source.includes('runDurationSeconds: nextRunDurationSeconds'), true);
  assert.equal(source.includes('grid-template-columns: repeat(2, minmax(0,1fr))'), true);
  assert.equal(source.includes('setRewardDraft(rewards.map((reward) => ({ ...reward })))'), true);
  assert.equal(source.includes('setRewardDraft([]);'), true);
  assert.equal(source.includes("setEditorError(error instanceof Error ? error.message : 'Tower settings could not be saved.')"), true);
  assert.equal(rewardEditorSource.match(/<select/g)?.length, 1);
  assert.equal(rewardEditorSource.match(/type="number"/g)?.length, 1);
  assert.equal(rewardEditorSource.match(/type="text"/g)?.length, 1);
  assert.equal(rewardEditorSource.includes('Reward Type'), true);
  assert.equal(rewardEditorSource.includes('Pass Name'), true);
  assert.equal(rewardEditorSource.includes("reward.type === 'DISCOUNT' ? 'Percent' : 'Minutes'"), true);
  assert.equal(rewardEditorSource.includes('reward-name-field'), false);
  assert.equal(rewardEditorSource.includes('reward-pass-field'), false);
  assert.equal(rewardEditorSource.includes('BRONZE'), false);
  assert.equal(rewardEditorSource.includes('SILVER'), false);
  assert.equal(rewardEditorSource.includes('GOLD'), false);
  assert.equal(source.includes('grid-template-columns: 82px minmax(180px,1fr) minmax(120px,.6fr)'), true);
  assert.equal(source.includes('@media (max-width: 520px)'), true);
  assert.equal(source.includes('.history-row { grid-template-columns: minmax(0,1fr); gap: 8px;'), true);
  assert.equal(source.includes('.history-meta { grid-template-columns: auto minmax(0,1fr);'), true);
  assert.equal(source.includes('aria-label="Search Tower history"'), true);
  assert.equal(source.includes('aria-label="Filter Tower history by status"'), true);
});

test('uses immediate start and restore scrolling with motion-aware Climb scrolling', () => {
  assert.equal(getTowerScrollBehavior('restore', false), 'auto');
  assert.equal(getTowerScrollBehavior('start', false), 'auto');
  assert.equal(getTowerScrollBehavior('climb', false), 'smooth');
  assert.equal(getTowerScrollBehavior('climb', true), 'auto');
});

test('hides Tower behind the shared spinner until initial layout and scrolling settle', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const loadingSource = readFileSync(new URL('../../app/tower/loading.tsx', import.meta.url), 'utf8');
  const layoutSource = readFileSync(new URL('../../app/tower/layout.tsx', import.meta.url), 'utf8');
  const settleStart = source.indexOf('if (!initialSettlingRef.current) return;');
  const settleEnd = source.indexOf('\n\n  useEffect(() => {\n    if (initialSettlingRef.current) return;', settleStart);
  const settleSource = source.slice(settleStart, settleEnd);

  assert.equal(layoutSource.includes('Back to Home'), true);
  assert.equal(loadingSource.includes('Back to Home'), false);
  assert.equal(source.includes('Back to Home'), false);
  assert.equal(loadingSource.includes('className="spinner"'), true);
  assert.equal(loadingSource.includes('Loading Tower...'), true);
  assert.equal(loadingSource.includes('fetch('), false);
  assert.equal(source.includes('const [settling, setSettling] = useState(true);'), true);
  assert.equal(source.includes('const initialSettlingRef = useRef(true);'), true);
  assert.equal(source.includes('aria-busy={settling}'), true);
  assert.equal(source.includes('aria-hidden={settling}'), true);
  assert.equal(source.includes('inert={settling}'), true);
  assert.equal(source.includes("style={settling ? { visibility: 'hidden' } : undefined}"), true);
  assert.equal(source.includes('className="tower-settling-loader"'), true);
  assert.equal(source.includes('className="spinner"'), true);
  assert.equal(source.includes('<span>Loading Tower...</span>'), true);
  assert.equal(settleSource.match(/window\.requestAnimationFrame/g)?.length, 2);
  assert.equal(settleSource.includes("scrollTowerFloor(currentFloorRef.current, 'auto');"), true);
  assert.equal(settleSource.includes('setSettling(false);'), true);
  assert.equal(settleSource.includes('fetch('), false);
  assert.equal(settleSource.includes('setTimeout'), false);
  assert.equal(source.includes("root.style.scrollBehavior = 'auto';"), true);
  assert.equal(source.includes('root.style.scrollBehavior = previousBehavior;'), true);
  assert.equal(source.includes("if (behavior === 'smooth')"), true);
  assert.equal(source.match(/setSettling\(/g)?.length, 1);
});

test('delays only motion-enabled red-card reveals', () => {
  assert.equal(TOWER_RED_CARD_REVEAL_MS, 1200);
  assert.equal(getTowerRedCardRevealDelay('LOSS', false), 1200);
  assert.equal(getTowerRedCardRevealDelay('LOSS', true), 0);
  assert.equal(getTowerRedCardRevealDelay('SAFE', false), 0);
  assert.equal(getTowerRedCardRevealDelay('SAFE', true), 0);
});

test('shows attempt expiry only while a climb is live or claimable', () => {
  assert.equal(shouldShowTowerAttemptExpiry('IN_PROGRESS'), true);
  assert.equal(shouldShowTowerAttemptExpiry('COMPLETED'), true);
  assert.equal(shouldShowTowerAttemptExpiry('LOST'), false);
  assert.equal(shouldShowTowerAttemptExpiry('TIMED_OUT'), false);
  assert.equal(shouldShowTowerAttemptExpiry('EXPIRED'), false);
  assert.equal(shouldShowTowerAttemptExpiry('CLAIMED'), false);
});

test('keeps the live summary and frames one compact emblem as the tower roof', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{timedStatus && \(\s*<div className="tower-run-summary">/);
  assert.equal(source.includes('<div className="tower-emblem" aria-hidden="true"><span className="tower-roof-base" /><Castle size={40} strokeWidth={1.7} /></div>'), true);
  assert.equal(source.indexOf('className="tower-run-summary"') < source.indexOf('className="tower-emblem"'), true);
  assert.equal(source.indexOf('className="tower-emblem"') < source.indexOf('className="tower-building"'), true);
  assert.equal(source.includes('.tower-emblem { position: relative; height: 76px; display: grid; place-items: center;'), true);
  assert.equal(source.includes('.tower-emblem::before, .tower-emblem::after'), true);
  assert.equal(source.includes('.tower-roof-base { position: absolute;'), true);
  assert.equal(source.includes('--tower-roof-width: 140px'), true);
  assert.equal(source.includes('width: var(--tower-roof-width); height: 1px; background: var(--tower-structure)'), true);
  assert.equal(source.includes('.tower-building::before { content:'), true);
  assert.equal(source.includes('width: var(--tower-roof-width); border-right: 1px solid var(--tower-structure); border-left: 1px solid var(--tower-structure)'), true);
  assert.equal(source.includes('failedClimb'), false);
  assert.equal(source.includes('function statusLabel('), false);
});

test('limits the purple trial to current-floor interaction accents', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('--tower-current-accent: #a78bfa'), true);
  assert.ok((source.match(/var\(--tower-current-accent\)/g)?.length ?? 0) >= 6);
  assert.equal(source.includes('.tower-floor.current .floor-label > b { border-color: var(--tower-current-accent)'), true);
  assert.equal(source.includes(':global(.floor-state.current) { color: var(--tower-current-accent)'), true);
  assert.equal(source.includes('outline: 2px solid var(--tower-current-accent)'), true);
  assert.equal(source.includes('border-color: var(--tower-current-accent); background: #211a38'), true);
  assert.equal(source.includes('className="tower-message"'), true);
  assert.equal(source.includes('.tower-message { min-height: 40px; display: flex; align-items: center; padding: 8px 10px; border-left: 3px solid var(--tower-current-accent); background: #211a38; color: #ddd6fe;'), true);
  assert.equal(source.includes('tower-message loss'), false);
  assert.equal(source.includes('tower-message secured'), false);
  assert.equal(source.includes("className={`tower-decision-actions ${canClaim && canClimb ? '' : 'single'}`}"), true);
  assert.equal(source.includes('Securing...'), true);
  assert.equal(source.includes('<ArrowUp size={16} /> Next Floor'), true);
  assert.equal(source.includes("fetch('/api/tower/continue'"), true);
  assert.equal(source.includes('setState((current) => ({ ...current, attempt: data.attempt }))'), true);
  assert.equal(source.includes('.tower-actions { position: fixed'), false);
  assert.equal(source.includes('{showInlineFeedback && floor.level === focusedLevel && ('), true);
  assert.equal(source.includes('.tower-floor.pending-safe { border-color: #48bc7f; background: #10231b; }'), true);
});

test('keeps the mobile progression hierarchy simple, numbered, and accessible', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('../../app/tower/page.tsx', import.meta.url), 'utf8');
  const layoutSource = readFileSync(new URL('../../app/tower/layout.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('data-level={floor.level}'), false);
  assert.equal(source.includes('<small>F</small>'), false);
  assert.equal(source.includes('<small>{index + 1}</small>'), false);
  assert.equal(source.includes('<small>{position + 1}</small>'), false);
  assert.equal(source.includes('`Choose floor ${floor.level} card ${index + 1}`'), true);
  assert.equal(source.includes('aria-label={selected ? `Card ${position + 1} was safe`'), true);
  assert.equal(source.includes('scrollReasonRef.current = \'start\''), true);
  assert.equal(source.includes('scrollReasonRef.current = \'climb\''), true);
  assert.equal(source.includes('getTowerScrollBehavior(reason, reducedMotion)'), true);
  assert.equal(source.includes('tower-scroll-space'), false);
  assert.equal(source.includes('.tower-page.active-run { padding-bottom:'), true);
  assert.equal(source.includes('.tower-page.active-run.has-actions { padding-bottom:'), true);
  assert.equal(source.includes('<small><Clock3 size={13} /> Valid until'), true);
  assert.equal(source.includes('.tower-mini-cards.terminal-reveal'), true);
  assert.equal(source.includes('grid-template-columns: repeat(3, 28px)'), true);
  assert.equal(source.includes('width: 28px; height: 22px'), true);
  assert.equal(source.includes('.tower-mini-card.selected-safe'), true);
  assert.equal(source.includes("chosenSafe ? <Zap size={iconSize} />"), true);
  assert.equal(source.includes("role={historyLabel ? 'img' : undefined}"), true);
  assert.equal(source.includes('You selected card ${selectedPosition + 1} safely.'), true);
  assert.equal(source.includes("terminalReveal = redPosition !== undefined"), true);
  assert.equal(source.includes('const showHistoryCards = !isFocused && !isLocked'), true);
  assert.equal(source.includes('!showHistoryCards && <FloorMarker'), true);
  assert.equal(source.includes('showHistoryCards && <MiniCards'), true);
  assert.equal(source.includes("presentation === 'cleared') return <span className=\"floor-state"), false);
  assert.equal(source.includes("presentation === 'lost') return <span className=\"floor-state"), false);
  assert.equal(source.includes('Fresh climb next time'), false);
  assert.equal(source.includes('Red card ends this climb. Come back stronger next time.'), true);
  assert.equal(source.includes('You have ${duration} to complete your climb and take a reward.'), true);
  assert.equal(source.includes('When time runs out, your climb ends and all unclaimed rewards are lost.'), true);
  assert.equal(source.includes('<Link href="/my-bookings" className="btn btn-primary btn-lg"><BookOpen size={18} /> View My Bookings</Link>'), true);
  assert.equal(source.includes('Back to Home'), false);
  assert.equal(pageSource.includes('Back to Home'), false);
  assert.equal(layoutSource.match(/Back to Home/g)?.length, 1);
  assert.equal(layoutSource.includes('className="tower-route-back"'), true);
  assert.equal(source.includes('border-color: rgba(97,232,255,0.3); background: #111b2a; color: #61e8ff'), true);
  assert.equal(source.includes('.tower-floor.revealed .floor-label > b'), true);
  assert.equal(source.includes('background: #17613f'), true);
  assert.equal(source.includes('from that run'), false);
  assert.equal(source.includes('next run'), false);
  assert.equal(source.includes('This run'), false);
  assert.equal(source.includes('This run earned zero'), false);
  assert.equal(source.includes('Zero reward'), false);
  assert.equal(source.includes('.tower-floor.pending-safe'), true);
  assert.equal(source.includes('.tower-floor.cleared'), true);
  assert.equal(source.includes('grid-template-columns: repeat(3, minmax(0,1fr))'), true);
  assert.equal(source.includes('min-height: 96px'), true);
  assert.equal(source.includes('min-height: 108px'), true);
  assert.equal(source.includes('border: 2px solid var(--tower-current-accent)'), true);
  assert.equal(source.includes('tower-roof-base'), true);
  assert.equal(source.includes('tower-base'), false);
  assert.equal(source.includes('clip-path'), false);
  assert.equal(source.includes('gradient'), false);
  assert.equal(source.includes('box-shadow'), false);
  assert.equal(source.match(/@keyframes tower(?:RedCardPulse|SafeCardPulse)/g)?.length, 2);
  assert.equal(source.includes('infinite'), false);
  assert.equal(source.includes('claimCode'), false);
  assert.equal(source.includes('counterCode'), false);
  assert.equal(source.includes('ticket.code'), false);
  assert.equal(source.includes('RewardTicketCard'), true);
  assert.equal(source.includes('@media (prefers-reduced-motion: reduce)'), true);
});

test('shows the six-step Tower guide with lightweight optional visuals', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const guideSource = readFileSync(new URL('../../components/InfoGuideModal.tsx', import.meta.url), 'utf8');
  const guideStart = source.indexOf('function getTowerGuideSteps');
  const guideEnd = source.indexOf('function rewardLabel', guideStart);
  const towerGuide = source.slice(guideStart, guideEnd);

  for (const title of ['Start Your Climb', 'Climb 10 Floors', 'Pick a Card', 'Green Card', 'Red Card', 'Beat the Clock']) {
    assert.equal(towerGuide.includes(`title: '${title}'`), true);
  }
  assert.equal(towerGuide.includes('1 Tower Token for one climb'), true);
  assert.equal(towerGuide.includes('counter Reward Ticket'), true);
  assert.equal(towerGuide.includes('before expiry'), true);
  assert.equal(towerGuide.includes('formatGuideDuration(runDurationSeconds)'), true);
  assert.equal(towerGuide.includes('You have ${duration}'), true);
  assert.equal(towerGuide.includes('120 seconds'), false);
  assert.equal(towerGuide.includes("state: 'hidden'"), true);
  assert.equal(towerGuide.includes("state: 'safe'"), true);
  assert.equal(towerGuide.includes("state: 'red'"), true);
  assert.equal(towerGuide.includes('icon: Coins'), true);
  assert.equal(towerGuide.includes('icon: Castle'), true);
  assert.equal(towerGuide.includes('icon: Timer'), true);

  assert.equal(guideSource.includes('visual?: InfoGuideStepVisual'), true);
  assert.equal(guideSource.includes("className={step.visual ? 'has-visual' : undefined}"), true);
  assert.equal(guideSource.match(/<i>\?<\/i>/g)?.length, 3);
  assert.equal(guideSource.includes("step.visual.state === 'safe' && <Zap"), true);
  assert.equal(guideSource.includes("step.visual.state === 'red' && <X"), true);
  assert.equal(guideSource.includes('role="img" aria-label={step.visual.label}'), true);
  assert.equal(guideSource.includes('grid-template-columns: 30px 44px minmax(0, 1fr)'), true);
  assert.equal(guideSource.includes('grid-template-columns: 28px 38px minmax(0, 1fr)'), true);
  assert.equal(guideSource.includes('@keyframes'), false);
});

test('keeps Tower duration server-configured and exposes only public timing values', () => {
  const tower = readFileSync(new URL('../../lib/tower.ts', import.meta.url), 'utf8');
  const clock = readFileSync(new URL('../../lib/tower-clock.ts', import.meta.url), 'utf8');
  const settingsRoute = readFileSync(new URL('../../app/api/settings/route.ts', import.meta.url), 'utf8');

  assert.equal(clock.includes('DEFAULT_TOWER_RUN_DURATION_SECONDS = 120'), true);
  assert.equal(clock.includes('[60, 90, 120, 150, 180, 210, 240, 270, 300]'), true);
  assert.equal(clock.includes('runDurationSeconds * 1000'), true);
  assert.equal(tower.includes("const TOWER_RUN_DURATION_KEY = 'tower_run_duration_seconds'"), true);
  assert.equal(tower.includes("where: { key: TOWER_REWARDS_KEY },\n    update: {},"), true);
  assert.equal(tower.includes('runExpiresAt: getTowerRunExpiry(now, token.expiresAt, config.runDurationSeconds)'), true);
  assert.equal(tower.includes('climbDurationSeconds: Math.max(0, Math.ceil('), true);
  assert.equal(tower.includes('runDurationSeconds: config.runDurationSeconds'), true);
  assert.equal(settingsRoute.includes("'tower_run_duration_seconds'"), true);
});

test('shows a one-time lightweight confirmation after a successful Tower claim', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const claimStart = source.indexOf('const claim = async () =>');
  const claimEnd = source.indexOf('\n\n  return (', claimStart);
  const claimSource = source.slice(claimStart, claimEnd);

  assert.equal(source.includes('useState<TowerRewardTicket | null>(null)'), true);
  assert.equal(claimSource.includes("if (!response.ok) throw new Error(data.error ?? 'Unable to take reward.')"), true);
  assert.equal(claimSource.includes('if (data.ticket) setClaimedTicket(data.ticket);'), true);
  assert.equal(
    claimSource.indexOf("if (!response.ok) throw new Error(data.error ?? 'Unable to take reward.')")
      < claimSource.indexOf('if (data.ticket) setClaimedTicket(data.ticket);'),
    true,
  );
  assert.equal(source.includes('{claimedTicket && ('), true);
  assert.equal(source.includes('<AdminModalShell'), true);
  assert.equal(source.includes('aria-label="Close reward confirmation"'), true);
  assert.equal(source.includes('<h2 id="tower-claim-title">Congratulations!</h2>'), true);
  assert.equal(source.includes('You won <strong>{rewardLabel(claimedTicket.reward)}</strong>.'), true);
  assert.equal(source.includes('Redeem by <strong>{formatExpiry(claimedTicket.expiresAt)}</strong>'), true);
  assert.equal(source.includes('onClick={() => closeClaimPopup(true)}'), true);
  assert.equal(source.includes('onClose={() => closeClaimPopup()}'), true);
  assert.equal(source.includes('setClaimedTicket(initialState'), false);
});

test('closes the claim confirmation before scrolling and focusing Reward Tickets', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');

  assert.equal(source.includes('scrollToTicketsAfterCloseRef.current = checkTickets;'), true);
  assert.equal(source.includes('setClaimedTicket(null);'), true);
  assert.equal(source.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches"), true);
  assert.equal(source.includes("behavior: reducedMotion ? 'auto' : 'smooth'"), true);
  assert.equal(source.includes("rewardTicketsRef.current?.scrollIntoView({"), true);
  assert.equal(source.includes('rewardTicketsHeadingRef.current?.focus({ preventScroll: true });'), true);
  assert.equal(source.includes('ref={rewardTicketsRef} id="tower-reward-tickets"'), true);
  assert.equal(source.includes('ref={rewardTicketsHeadingRef} id="tower-reward-tickets-title" tabIndex={-1}'), true);
  assert.equal(source.includes('max-width: 340px'), true);
  assert.equal(source.includes('backdrop-filter: none; -webkit-backdrop-filter: none'), true);
  assert.equal(source.includes('background: #0e1420; animation: none'), true);
});

test('stages one lightweight red card before the terminal tower reveal', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const pickStart = source.indexOf('const pick = async (cardId: string) =>');
  const pickEnd = source.indexOf('\n\n  const continueTower', pickStart);
  const pickSource = source.slice(pickStart, pickEnd);

  assert.equal(source.includes('useState<TowerRedCardReveal | null>(null)'), true);
  assert.equal(pickSource.includes('const redCardRevealDelay = staleSafeReplay ? 0 : getTowerRedCardRevealDelay(data.result, reducedMotion);'), true);
  assert.equal(pickSource.includes('if (redCardRevealDelay > 0)'), true);
  assert.equal(pickSource.includes('setRedCardReveal({ cardId });'), true);
  assert.equal(pickSource.includes('redCardRevealTimerRef.current = window.setTimeout(() => {'), true);
  assert.equal(pickSource.includes('}, redCardRevealDelay);'), true);
  assert.equal(source.includes('window.clearTimeout(redCardRevealTimerRef.current);'), true);
  assert.equal(source.includes('nextRemaining === 0 && !redCardRevealActive'), true);
  assert.equal(source.includes("!result && !loading && !redCardRevealActive"), true);
  assert.equal(source.includes('attempt?.canClaim && runIsOpen && !redCardRevealActive'), true);
  assert.equal(source.includes("pendingSafeLevel && attempt?.canClaim && runIsOpen && !redCardRevealActive"), true);
  assert.equal(source.includes("attempt?.status === 'IN_PROGRESS' && !attempt.canClaim && runIsOpen"), true);
  assert.equal(source.includes("lastResolvedFloor?.result === 'SAFE'"), true);
  assert.equal(source.includes('redCard ? `Floor ${floor.level} card ${index + 1} was red`'), true);
  assert.equal(source.includes("redCard ? <X size={27} /> : '?'"), true);
  assert.equal(source.includes('.active-cards button.red-card-reveal strong { color: #ffd9de; }'), true);
  assert.equal(source.includes('.active-cards.showing-red-card button:not(.red-card-reveal)'), true);
  assert.equal(source.includes('animation: towerRedCardPulse ${TOWER_RED_CARD_REVEAL_MS}ms ease-out forwards'), true);
  assert.equal(source.includes('.active-cards button.red-card-reveal { animation: none; }'), true);
  assert.equal(source.match(/@keyframes towerRedCardPulse/g)?.length, 1);
  assert.equal(source.includes('Bomb'), false);
  assert.equal(source.includes('LossBlast'), false);
  assert.equal(source.includes('spark'), false);
  assert.equal(source.includes('tower-loss-'), false);
  assert.equal(source.includes('box-shadow'), false);
  assert.equal(source.includes('infinite'), false);
});

test('shows one action-aware spinner while Tower requests are pending', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const pickStart = source.indexOf('const pick = async (cardId: string) =>');
  const pickEnd = source.indexOf('\n\n  const continueTower', pickStart);
  const pickSource = source.slice(pickStart, pickEnd);

  assert.equal(source.includes("type TowerPendingAction = 'start' | 'pick' | 'climb' | 'claim' | 'refresh' | null"), true);
  assert.equal(source.includes("const isStarting = pendingAction === 'start'"), true);
  assert.equal(source.includes('loading: isStarting || (loading && !attempt)'), true);
  assert.equal(source.includes("const isPicking = pendingAction === 'pick'"), true);
  assert.equal(source.includes("const isClimbing = pendingAction === 'climb'"), true);
  assert.equal(source.includes("const isClaiming = pendingAction === 'claim'"), true);
  assert.equal(pickSource.includes("setPendingAction('pick')"), true);
  assert.equal(pickSource.includes("finishPendingAction('pick')"), true);
  assert.equal(source.includes('pendingCard ? <span className="spinner tower-pending-spinner tower-card-spinner"'), true);
  assert.equal(source.includes(".active-cards.is-picking button:not(.pending-card) { opacity: .32; }"), true);
  assert.equal(source.includes('aria-busy={pendingCard}'), true);
  assert.equal(source.includes('Revealing your card.'), true);
  assert.equal(source.includes('Climbing to the next floor.'), true);
  assert.equal(source.includes('Securing your Reward Ticket.'), true);
  assert.equal(source.includes('Climbing...'), true);
  assert.equal(source.includes('Securing...'), true);
  assert.equal(source.includes('.tower-pending-spinner { animation: none; }'), true);
  assert.equal(source.match(/@keyframes/g)?.length, 2);
  assert.equal(source.match(/window\.setTimeout/g)?.length, 1);
});

test('pulses the selected safe card without delaying reward actions', () => {
  const source = readFileSync(new URL('../../components/TowerClient.tsx', import.meta.url), 'utf8');
  const safeKeyframesStart = source.indexOf('@keyframes towerSafeCardPulse');
  const safeKeyframesEnd = source.indexOf('@media (max-width: 340px)', safeKeyframesStart);
  const safeKeyframes = source.slice(safeKeyframesStart, safeKeyframesEnd);

  assert.equal(source.includes('const TOWER_SAFE_CARD_PULSE_MS = 700;'), true);
  assert.equal(source.includes("{selected ? <Zap size={27} /> : '?'}"), true);
  assert.equal(source.includes('<Check size={27} />'), false);
  assert.equal(source.includes(':global(.decision-card.selected) { border-color: #4ac488; background: #17452f; color: #b7efcf; animation: towerSafeCardPulse ${TOWER_SAFE_CARD_PULSE_MS}ms ease-out forwards; }'), true);
  assert.equal(source.includes(':global(.decision-card.selected strong) { color: #b7efcf; }'), true);
  assert.equal(source.includes(':global(.decision-card.selected) { animation: none; }'), true);
  assert.equal(safeKeyframes.includes('transform:'), true);
  assert.equal(safeKeyframes.includes('opacity:'), false);
  assert.equal(source.match(/@keyframes/g)?.length, 2);
  assert.equal(source.match(/window\.setTimeout/g)?.length, 1);
  assert.equal(source.includes("lastResolvedFloor?.result === 'SAFE'"), true);
  assert.equal(source.includes('(canClaim || canClimb) && ('), true);
  assert.equal(source.includes('infinite'), false);
});
