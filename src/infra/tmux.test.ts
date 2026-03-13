import { describe, expect, it, vi } from 'vitest'

import { createMoveCursorCommands } from '../core/action'
import { displayPopup, focusClientPane, getPaneStartContext } from './tmux'

describe('tmux helpers', () => {
  it('creates copy-mode cursor movement commands', () => {
    expect(
      createMoveCursorCommands('%1', {
        line: 3,
        charCol: 4,
        primaryChar: 2,
      }),
    ).toEqual([
      ['send-keys', '-X', '-t', '%1', 'top-line'],
      ['send-keys', '-X', '-N', '2', '-t', '%1', 'cursor-down'],
      ['send-keys', '-X', '-t', '%1', 'start-of-line'],
      ['send-keys', '-X', '-N', '6', '-t', '%1', 'cursor-right'],
    ])
  })

  it('resolves pane start context for the target pane', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce('%127\t1\t181\t64\t/tmp/tmux-fuzzy-motion'),
    }

    await expect(getPaneStartContext(tmux, '%127')).resolves.toEqual({
      paneId: '%127',
      inCopyMode: true,
      width: 181,
      height: 64,
      currentPath: '/tmp/tmux-fuzzy-motion',
    })
  })

  it('fails when the target pane is not in copy-mode', async () => {
    const tmux = {
      run: vi.fn(),
      runQuiet: vi.fn(),
      capture: vi
        .fn()
        .mockResolvedValueOnce('%127\t0\t181\t64\t/tmp/tmux-fuzzy-motion'),
    }

    await expect(getPaneStartContext(tmux, '%127')).rejects.toThrow(
      'tmux-fuzzy-motion: pane is not in copy-mode',
    )
  })

  it('maps switch-client failures to a client not found error', async () => {
    const tmux = {
      run: vi.fn().mockRejectedValueOnce(new Error('no such client')),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await expect(focusClientPane(tmux, '%127', '/dev/ttys001')).rejects.toThrow(
      'tmux-fuzzy-motion: client not found',
    )
  })

  it('runs display-popup with the target client and pane', async () => {
    const tmux = {
      run: vi.fn().mockResolvedValue(undefined),
      runQuiet: vi.fn(),
      capture: vi.fn(),
    }

    await displayPopup(tmux, {
      command: [
        process.execPath,
        '/tmp/dist/cli.js',
        'popup',
        '--state-file',
        '/tmp/state.json',
      ],
      currentPath: '/tmp/work',
      height: 24,
      targetClient: '/dev/ttys001',
      targetPane: '%127',
      width: 80,
    })

    expect(tmux.run).toHaveBeenCalledWith([
      'display-popup',
      '-E',
      '-B',
      '-c',
      '/dev/ttys001',
      '-t',
      '%127',
      '-d',
      '/tmp/work',
      '-x',
      '#{popup_pane_left}',
      '-y',
      '#{popup_pane_top}',
      '-w',
      '80',
      '-h',
      '24',
      process.execPath,
      '/tmp/dist/cli.js',
      'popup',
      '--state-file',
      '/tmp/state.json',
    ])
  })
})
