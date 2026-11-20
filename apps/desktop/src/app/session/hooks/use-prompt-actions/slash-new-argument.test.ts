import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { onComposerInsertRequest } from '@/app/chat/composer/focus'
import { en } from '@/i18n/en'

import { useSlashCommand } from './slash'
import type { GatewayRequest } from './utils'

afterEach(cleanup)

// The insert bus defers by one macrotask (focus.ts's dispatch), so assertions
// must yield once before reading what rode the bus.
const busTick = () => act(async () => new Promise(r => setTimeout(r, 0)))

const disposer: (() => void)[] = []
beforeEach(() => disposer.splice(0).forEach(off => off()))

// /new used to swallow its argument: the desktop handler took no arg, and the
// submit chain had already cleared the composer on Enter, so a prompt typed
// as one submission was lost and no fresh draft ever received it. The argument
// must now land in the fresh draft (insert bus, target 'main') AFTER the
// route flips — never submitted, and never executed as a nested slash command.
function mountInsert(seen: { mode: string; target: string; text: string }[]) {
  disposer.push(
    onComposerInsertRequest(detail => {
      seen.push(detail as { mode: string; target: string; text: string })
    })
  )
}

function slashDeps(startFreshSessionDraft: () => void) {
  return {
      activeSessionIdRef: { current: 'runtime-a' },
      selectedStoredSessionIdRef: { current: 'stored-a' },
      busyRef: { current: false },
      copy: en.desktop,
      createBackendSessionForSend: async () => null,
      getRoutedStoredSessionId: () => 'stored-a',
      getRuntimeIdForStoredSession: () => 'runtime-a',
      requestGateway: vi.fn(async () => ({})) as GatewayRequest,
      resumeStoredSession: vi.fn(),
      updateSessionState: vi.fn(),
      submitPromptText: vi.fn(async () => true),
      appendSessionTextMessage: vi.fn(),
      branchCurrentSession: async () => true,
      handleSkinCommand: () => '',
      handoffSession: async () => ({ ok: true }),
      openMemoryGraph: vi.fn(),
      refreshSessions: async () => undefined,
    startFreshSessionDraft
  }
}

it('hands a /new argument to the fresh draft instead of dropping it', async () => {
  const inserted: { mode: string; target: string; text: string }[] = []
  mountInsert(inserted)

  const startFresh = vi.fn()
  const { result } = renderHook(() => useSlashCommand(slashDeps(startFresh)))

  await act(async () => {
    await result.current('/new fix the checkout bug')
  })
  await busTick()

  // The fresh draft was started (route flip), then the prompt rode the
  // insert bus — nothing was submitted to a session.
  expect(startFresh).toHaveBeenCalledTimes(1)
  expect(inserted).toEqual([{ mode: 'block', target: 'main', text: 'fix the checkout bug' }])
})

it('a bare /new inserts nothing', async () => {
  const inserted: { mode: string; target: string; text: string }[] = []
  mountInsert(inserted)

  const { result } = renderHook(() => useSlashCommand(slashDeps(() => undefined)))

  await act(async () => {
    await result.current('/new')
  })
  await busTick()

  expect(inserted).toHaveLength(0)
})
