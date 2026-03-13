import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DisplayPopupOptions } from '../infra/tmux'

const tmux = {
  run: vi.fn(),
  runQuiet: vi.fn(),
  capture: vi.fn(),
}

const fsMocks = vi.hoisted(() => ({
  mkdtemp: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  createDaemonSocketPath: vi.fn(),
  ensureDaemon: vi.fn(),
  resolveCliEntrypoint: vi.fn(),
}))

const tmuxMocks = vi.hoisted(() => ({
  createTmuxClient: vi.fn(),
  displayPopup: vi.fn(),
  focusClientPane: vi.fn(),
  getPaneStartContext: vi.fn(),
}))

const captureMocks = vi.hoisted(() => ({
  capturePane: vi.fn(),
  fitCaptureToHeight: vi.fn(),
}))

const actionMocks = vi.hoisted(() => ({
  moveCopyCursor: vi.fn(),
}))

vi.mock('node:fs/promises', () => fsMocks)
vi.mock('../infra/tmux', () => tmuxMocks)
vi.mock('../core/capture', () => captureMocks)
vi.mock('../core/action', () => actionMocks)
vi.mock('./runtime', () => runtimeMocks)

describe('runStart', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.TMUX = '/tmp/tmux-test'

    const capture = {
      text: '',
      lines: [],
      displayText: '',
      displayLines: ['alpha', 'beta'],
    }

    fsMocks.mkdtemp.mockResolvedValue('/tmp/tmux-fuzzy-motion-test')
    fsMocks.readFile.mockResolvedValue(JSON.stringify({ status: 'cancelled' }))
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.writeFile.mockResolvedValue(undefined)
    runtimeMocks.createDaemonSocketPath.mockReturnValue('/tmp/tfm-test.sock')
    runtimeMocks.ensureDaemon.mockResolvedValue(undefined)
    runtimeMocks.resolveCliEntrypoint.mockReturnValue('/tmp/dist/cli.js')

    tmuxMocks.createTmuxClient.mockReturnValue(tmux)
    tmuxMocks.displayPopup.mockResolvedValue(undefined)
    tmuxMocks.focusClientPane.mockResolvedValue(undefined)
    tmuxMocks.getPaneStartContext.mockResolvedValue({
      paneId: '%127',
      inCopyMode: true,
      currentPath: '/tmp',
      width: 80,
      height: 16,
    })

    captureMocks.capturePane.mockResolvedValue(capture)
    captureMocks.fitCaptureToHeight.mockReturnValue(capture)

    tmux.run.mockResolvedValue(undefined)
    tmux.runQuiet.mockResolvedValue(undefined)
    tmux.capture.mockResolvedValue('')
  })

  it('ensures the daemon and opens a popup for the target pane', async () => {
    fsMocks.readFile.mockResolvedValueOnce(
      JSON.stringify({
        status: 'selected',
        target: {
          kind: 'word',
          text: 'alpha',
          line: 1,
          col: 0,
          endCol: 5,
          charCol: 0,
          positions: [0],
          primary: 0,
          primaryChar: 0,
          score: 1,
          hint: 'A',
        },
      }),
    )

    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(0)

    expect(runtimeMocks.ensureDaemon).toHaveBeenCalledWith('/tmp/tfm-test.sock')
    expect(tmuxMocks.displayPopup).toHaveBeenCalledTimes(1)
    const popupOptions = tmuxMocks.displayPopup.mock.calls[0]?.[1] as
      | DisplayPopupOptions
      | undefined
    expect(popupOptions).toMatchObject({
      currentPath: '/tmp',
      height: 16,
      targetClient: '/dev/ttys001',
      targetPane: '%127',
      width: 80,
    })
    expect(popupOptions?.command).toEqual(
      expect.arrayContaining([
        process.execPath,
        expect.stringMatching(
          /(?:dist\/cli\.js|cli\.js|src\/cli\.ts|forks\.js)$/,
        ),
        'popup',
        '--state-file',
        '/tmp/tmux-fuzzy-motion-test/state.json',
        '--result-file',
        '/tmp/tmux-fuzzy-motion-test/result.json',
        '--socket',
        '/tmp/tfm-test.sock',
      ]),
    )
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/tmp/tmux-fuzzy-motion-test/state.json',
      expect.any(String),
      'utf8',
    )
    expect(tmux.runQuiet).toHaveBeenCalledWith(['select-pane', '-t', '%127'])
    expect(actionMocks.moveCopyCursor).toHaveBeenCalledWith(tmux, '%127', {
      kind: 'word',
      text: 'alpha',
      line: 1,
      col: 0,
      endCol: 5,
      charCol: 0,
      positions: [0],
      primary: 0,
      primaryChar: 0,
      score: 1,
      hint: 'A',
    })
  })

  it('fails when the popup exits without writing a result file', async () => {
    fsMocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))

    const { runStart } = await import('./start')

    await expect(runStart(['%127', '/dev/ttys001'])).resolves.toBe(2)

    expect(tmuxMocks.displayPopup).toHaveBeenCalledTimes(1)
    expect(actionMocks.moveCopyCursor).not.toHaveBeenCalled()
  })
})
