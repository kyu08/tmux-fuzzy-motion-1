import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { moveCopyCursor } from '../core/action'
import { capturePane, fitCaptureToHeight } from '../core/capture'
import {
  createDaemonSocketPath,
  ensureDaemon,
  resolveCliEntrypoint,
} from './runtime'
import {
  createTmuxClient,
  displayPopup,
  focusClientPane,
  getPaneStartContext,
} from '../infra/tmux'
import type { InputResult, InputState } from '../types'

const buildPopupCommand = (
  stateFile: string,
  resultFile: string,
  socketPath: string,
): string[] => [
  process.execPath,
  resolveCliEntrypoint(),
  'popup',
  '--state-file',
  stateFile,
  '--result-file',
  resultFile,
  '--socket',
  socketPath,
]

const readResult = async (resultFile: string): Promise<InputResult> => {
  try {
    return JSON.parse(await readFile(resultFile, 'utf8')) as InputResult
  } catch (error) {
    throw new Error('tmux-fuzzy-motion: popup did not produce result', {
      cause: error,
    })
  }
}

export const runStart = async (args: string[]): Promise<number> => {
  const [paneId, clientTty] = args

  if (!process.env.TMUX) {
    console.error('tmux-fuzzy-motion: must be run inside tmux')
    return 2
  }

  if (!paneId) {
    console.error('tmux-fuzzy-motion: pane not found')
    return 2
  }

  if (!clientTty) {
    console.error('tmux-fuzzy-motion: client not found')
    return 2
  }

  const tmux = createTmuxClient()
  const tempDir = await mkdtemp(join(tmpdir(), 'tmux-fuzzy-motion-'))
  const stateFile = join(tempDir, 'state.json')
  const resultFile = join(tempDir, 'result.json')
  const socketPath = createDaemonSocketPath()

  try {
    const pane = await getPaneStartContext(tmux, paneId)
    await focusClientPane(tmux, paneId, clientTty)
    const capture = fitCaptureToHeight(
      await capturePane(tmux, paneId),
      pane.height,
    )

    const state: InputState = {
      paneId,
      clientTty,
      displayLines: capture.displayLines,
      plainLines: capture.lines,
      width: pane.width,
      height: pane.height,
    }

    await writeFile(stateFile, JSON.stringify(state), 'utf8')
    await ensureDaemon(socketPath)
    await displayPopup(tmux, {
      command: buildPopupCommand(stateFile, resultFile, socketPath),
      currentPath: pane.currentPath,
      height: pane.height,
      targetClient: clientTty,
      targetPane: paneId,
      width: pane.width,
    })

    const result = await readResult(resultFile)
    if (result.status === 'selected') {
      await tmux.runQuiet(['select-pane', '-t', paneId])
      await moveCopyCursor(tmux, paneId, result.target)
    }

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    return message.startsWith('tmux-fuzzy-motion:') ? 2 : 1
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
