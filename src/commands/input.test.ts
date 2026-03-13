import { describe, expect, it } from 'vitest'

import {
  deleteBackwardChar,
  deleteBackwardWord,
  parseDaemonRequestLine,
  renderQueryOnBottomLine,
  serializeDaemonMessageLine,
} from './input'

describe('input editing helpers', () => {
  it('deletes one character backward', () => {
    expect(deleteBackwardChar('path')).toBe('pat')
    expect(deleteBackwardChar('')).toBe('')
  })

  it('deletes a shell-like word backward', () => {
    expect(deleteBackwardWord('foo/bar-baz')).toBe('foo/')
    expect(deleteBackwardWord('foo///')).toBe('')
    expect(deleteBackwardWord('')).toBe('')
  })

  it('renders query text at the bottom right edge', () => {
    expect(renderQueryOnBottomLine('alpha beta', 12, 'xy')).toContain('x')
    expect(renderQueryOnBottomLine('alpha beta', 12, 'xy')).toContain('y')
  })

  it('keeps the base line when query is empty', () => {
    expect(renderQueryOnBottomLine('alpha beta', 12, '')).toBe('alpha beta  ')
  })

  it('parses a prepare daemon request', () => {
    expect(
      parseDaemonRequestLine(
        JSON.stringify({
          type: 'prepare',
          stateFile: '/tmp/state.json',
        }),
      ),
    ).toEqual({
      type: 'prepare',
      stateFile: '/tmp/state.json',
    })
  })

  it('parses a ping daemon request', () => {
    expect(parseDaemonRequestLine(JSON.stringify({ type: 'ping' }))).toEqual({
      type: 'ping',
    })
  })

  it('parses a match daemon request with previous hints', () => {
    expect(
      parseDaemonRequestLine(
        JSON.stringify({
          type: 'match',
          query: 'abc',
          previousHints: {
            targetA: 'A',
          },
        }),
      ),
    ).toEqual({
      type: 'match',
      query: 'abc',
      previousHints: {
        targetA: 'A',
      },
    })
  })

  it('serializes daemon messages as JSON lines', () => {
    expect(
      serializeDaemonMessageLine({
        type: 'busy',
      }),
    ).toBe(`${JSON.stringify({ type: 'busy' })}\n`)
  })
})
