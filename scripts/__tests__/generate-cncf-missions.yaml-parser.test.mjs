import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSourcesConfig } from '../generate-cncf-missions.mjs'

describe('loadSourcesConfig', () => {
  let directory
  let configPath

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'knowledge-sources-'))
    configPath = join(directory, 'knowledge-sources.yaml')
  })

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  function load(yaml) {
    writeFileSync(configPath, yaml)
    return loadSourcesConfig(configPath)
  }

  it('preserves every checked-in source value and type from the previous parser', () => {
    // Compared with parseSimpleYaml before its removal. Pin the full shape
    // so changing parsers cannot silently change any production setting.
    expect(loadSourcesConfig()).toStrictEqual({
      sources: {
        'github-issues': {
          enabled: true,
          description: 'Closed GitHub issues with linked PRs (high engagement)',
          minReactions: 10,
          minComments: 10,
          maxPerProject: 20,
          searchWindow: '90d',
          rateLimitDelay: 200,
        },
        'github-discussions': {
          enabled: true,
          description: 'Answered GitHub Discussions (Q&A format)',
          minUpvotes: 5,
          maxPerProject: 10,
          searchWindow: '90d',
          rateLimitDelay: 200,
        },
        reddit: {
          enabled: true,
          description: 'Reddit posts from kubernetes/cloud-native subreddits',
          subreddits: ['kubernetes', 'devops', 'k8s', 'cloudnative'],
          minUpvotes: 20,
          maxPerProject: 10,
          searchWindow: '180d',
          rateLimitDelay: 2000,
        },
        stackoverflow: {
          enabled: true,
          description: 'Stack Overflow Q&A with accepted answers',
          minVotes: 10,
          maxPerProject: 10,
          searchWindow: '365d',
          rateLimitDelay: 1000,
        },
        'cncf-blog': {
          enabled: false,
          description: 'CNCF blog posts and case studies',
          maxPerProject: 5,
          searchWindow: '365d',
        },
      },
    })
  })

  it('keeps the existing defaults when the config file is missing', () => {
    expect(loadSourcesConfig(configPath)).toStrictEqual({
      sources: {
        'github-issues': { enabled: true, minReactions: 10, maxPerProject: 20, searchWindow: '90d' },
      },
    })
  })

  it('handles YAML strings, comments, numbers, booleans, and arrays', () => {
    expect(load(`
# Source settings
sources:
  reddit:
    enabled: true # enabled source
    dryRun: false
    count: 42
    ratio: 3.14
    offset: -2
    searchWindow: "90d"
    label: "C# and #kubernetes" # preserve quoted hashes
    url: https://example.com/page#section
    numericLabel: "42"
    booleanLabel: 'true'
    tags: ["cloud, native", devops, 3, false]
    subreddits:
      - kubernetes # first community
      - 'devops'
`)).toStrictEqual({
      sources: {
        reddit: {
          enabled: true, dryRun: false, count: 42, ratio: 3.14, offset: -2,
          searchWindow: '90d', label: 'C# and #kubernetes',
          url: 'https://example.com/page#section', numericLabel: '42', booleanLabel: 'true',
          tags: ['cloud, native', 'devops', 3, false], subreddits: ['kubernetes', 'devops'],
        },
      },
    })
  })

  it('supports nested mappings, multiline strings, and aliases', () => {
    expect(load(`
sources:
  reddit:
    options: &options
      retries: 3
      labels: []
    description: |-
      First line
      Second line
  github-issues:
    options: *options
`)).toStrictEqual({
      sources: {
        reddit: { options: { retries: 3, labels: [] }, description: 'First line\nSecond line' },
        'github-issues': { options: { retries: 3, labels: [] } },
      },
    })
  })

  it.each(['', '\n # comment only\n'])('uses YAML null semantics for an empty document (%j)', yaml => {
    expect(load(yaml)).toBeNull()
  })

  it('uses null for bare keys and an explicit mapping for empty sources', () => {
    expect(load('sources:\n  reddit:\n')).toStrictEqual({ sources: { reddit: null } })
    expect(load('sources: {}\n')).toStrictEqual({ sources: {} })
  })

  it.each([
    'sources:\n  reddit:\n    label: "unterminated\n',
    'sources:\n  reddit:\n    tags: [unclosed\n',
    'sources:\n  reddit:\n    enabled: true\n    enabled: false\n',
    'sources:\n  reddit:\n    justAToken\n    enabled: true\n',
  ])('rejects malformed or ambiguous YAML instead of silently dropping it (%j)', yaml => {
    expect(() => load(yaml)).toThrow()
  })
})
